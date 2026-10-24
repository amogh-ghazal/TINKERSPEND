package `in`.tinkercraft.tinkerspend.capture

import android.content.Context
import android.util.Log
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.random.Random

object SyncScheduler {
    private const val NAME = "tinkerspend-sync"
    fun schedule(ctx: Context, delaySec: Long = 0, userInitiated: Boolean = false) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .apply { if (delaySec > 0) setInitialDelay(delaySec, TimeUnit.SECONDS) }
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(NAME, if (userInitiated) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.APPEND_OR_REPLACE, req)
    }
    fun cancel(ctx: Context) = WorkManager.getInstance(ctx).cancelUniqueWork(NAME)
}

class SyncWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    private val prefs = Prefs(ctx)
    private val dao = OutboxDb.get(ctx).dao()
    private val api = ApiClient(ctx)

    override fun doWork(): Result {
        val owner = prefs.boundUserId ?: return Result.success()
        if (prefs.authPaused || !api.hasSession()) return Result.success() // resumes after sign-in
        cleanup()
        return try {
            for (round in 0 until 10) {
                val batch = dao.duePending(owner, System.currentTimeMillis(), 5)
                if (batch.isEmpty()) break
                when (val r = uploadBatch(batch)) {
                    is Outcome.Ok -> Unit
                    is Outcome.Retry -> { if (r.afterSec != null) { SyncScheduler.schedule(applicationContext, r.afterSec); return Result.success() }; return Result.retry() }
                    Outcome.AuthPaused -> return Result.success()
                }
            }
            enrich(owner)
        } catch (e: IOException) {
            Log.w("TSSync", "network error ${e.javaClass.simpleName}")
            Result.retry()
        }
    }

    sealed class Outcome { object Ok : Outcome(); data class Retry(val afterSec: Long?) : Outcome(); object AuthPaused : Outcome() }

    private fun uploadBatch(batch: List<OutboxEvent>): Outcome {
        val events = JSONArray()
        val sendable = mutableListOf<OutboxEvent>()
        for (e in batch) {
            val cipher = e.payloadCipher
            if (cipher == null) { dao.markFailed(e.eventId, "payload_missing"); continue }
            val payload = try { JSONObject(String(Crypto.decrypt(cipher))) } catch (_: Exception) { dao.markFailed(e.eventId, "decrypt_failed"); continue }
            events.put(JSONObject()
                .put("event_id", e.eventId).put("source_package", e.sourcePackage).put("source_key_hash", e.sourceKeyHash)
                .put("posted_at", e.postedAt).put("captured_at", e.capturedAt).put("content_hash", e.contentHash)
                .put("parser_version", e.parserVersion).put("title", payload.opt("title").takeIf { it is String } ?: JSONObject.NULL)
                .put("text", payload.opt("text").takeIf { it is String } ?: JSONObject.NULL)
                .put("is_current_import", e.isCurrentImport).put("timezone", e.timezone))
            sendable += e
        }
        if (sendable.isEmpty()) return Outcome.Ok
        val body = JSONObject().put("device_install_id", prefs.installId).put("events", events).toString()
        val resp = api.request("POST", "/api/v1/notifications/batch", body)
        val now = System.currentTimeMillis()
        when {
            resp.status == 200 -> {
                val acks = JSONObject(resp.body).getJSONArray("acks")
                for (i in 0 until acks.length()) {
                    val a = acks.getJSONObject(i)
                    val id = a.getString("event_id")
                    val status = a.getString("status")
                    if (status == "rejected") { dao.markFailed(id, a.optString("error_code", "rejected")); continue }
                    val draftId = a.optString("draft_id", "").takeIf { it.isNotEmpty() && it != "null" }
                    val job = if (a.optBoolean("needs_enrichment") && draftId != null)
                        EnrichJob(draftId = draftId, ownerUserId = prefs.boundUserId!!, operationId = UUID.randomUUID().toString(), createdAt = now) else null
                    dao.ackWithFollowUp(id, status, now, job)
                }
                prefs.lastSyncAt = now
                return Outcome.Ok
            }
            resp.status == 401 || resp.status == 403 -> { prefs.authPaused = true; return Outcome.AuthPaused }
            resp.status == 413 || resp.status == 422 || resp.status == 400 -> {
                if (sendable.size == 1) dao.markFailed(sendable[0].eventId, "invalid_payload_${resp.status}")
                else sendable.drop(1).forEach { dao.markRetry(it.eventId, now + 1000, "isolating_bad_event") } // retry one by one
                return Outcome.Ok
            }
            resp.status == 429 || resp.status >= 500 -> {
                val jitter = Random.nextLong(0, 15)
                sendable.forEach { dao.markRetry(it.eventId, now + ((resp.retryAfterSec ?: 60) + jitter) * 1000, "http_${resp.status}") }
                return Outcome.Retry(resp.retryAfterSec?.plus(jitter))
            }
            else -> { sendable.forEach { dao.markRetry(it.eventId, now + 300_000, "http_${resp.status}") }; return Outcome.Ok }
        }
    }

    /** Second stage: bounded AI enrichment of owned drafts, independent of any WebView. */
    private fun enrich(owner: String): Result {
        val jobs = dao.dueJobs(owner, System.currentTimeMillis(), 5)
        for (j in jobs) {
            val body = JSONObject().put("draft_id", j.draftId).put("operation_id", j.operationId).toString()
            val r = api.request("POST", "/api/v1/ai/classify", body)
            val now = System.currentTimeMillis()
            when {
                r.status == 200 || r.status == 404 || r.status == 409 -> dao.deleteJob(j.draftId)
                r.status == 401 || r.status == 403 -> { prefs.authPaused = true; return Result.success() }
                r.status == 429 -> dao.deferJob(j.draftId, now + (r.retryAfterSec ?: 3600) * 1000, "quota")
                r.status >= 500 -> dao.deferJob(j.draftId, now + 600_000, "http_${r.status}")
                else -> dao.failJob(j.draftId, "http_${r.status}")
            }
        }
        return Result.success()
    }

    private fun cleanup() {
        val now = System.currentTimeMillis()
        dao.dropAckedPayloads(now - TimeUnit.HOURS.toMillis(72))
        dao.deleteOldAcked(now - TimeUnit.DAYS.toMillis(30))
    }
}
