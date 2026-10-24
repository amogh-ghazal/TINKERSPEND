package `in`.tinkercraft.tinkerspend.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors

class PaymentNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        val prefs = Prefs(this)
        prefs.listenerConnected = true
        prefs.lastListenerConnectAt = System.currentTimeMillis()
        `in`.tinkercraft.tinkerspend.plugins.ListenerHolder.instance = this
    }

    override fun onListenerDisconnected() {
        Prefs(this).listenerConnected = false
        `in`.tinkercraft.tinkerspend.plugins.ListenerHolder.instance = null
        // Supported reconnection path (API 24+): ask the system to rebind.
        try { requestRebind(android.content.ComponentName(this, PaymentNotificationListener::class.java)) } catch (_: Throwable) {}
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Keep the callback short: copy fields, then persist off the main thread.
        val pkg = sbn.packageName ?: return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (n.flags and Notification.FLAG_ONGOING_EVENT != 0) return
        val snapshot = Capturer.Snapshot.from(pkg, sbn.key ?: "", if (n.`when` > 0) n.`when` else sbn.postTime, n) ?: return
        executor.execute { Capturer.capture(applicationContext, snapshot, isCurrentImport = false) }
    }

    companion object {
        val executor = Executors.newSingleThreadExecutor()
    }
}

object Capturer {
    private const val TAG = "TSCapture"
    const val PARSER_VERSION = "kt-1"
    const val OUTBOX_LIMIT_BYTES = 50L * 1024 * 1024

    data class Snapshot(val pkg: String, val key: String, val postedAt: Long, val title: String?, val text: String?) {
        companion object {
            fun from(pkg: String, key: String, postedAt: Long, n: Notification): Snapshot? {
                val ex = n.extras ?: return null
                val title = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString()
                val big = ex.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
                val text = ex.getCharSequence(Notification.EXTRA_TEXT)?.toString()
                val lines = ex.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n") { it.toString() }
                val body = listOfNotNull(big ?: text, lines).filter { it.isNotBlank() }.distinct().joinToString("\n")
                if (title.isNullOrBlank() && body.isBlank()) return null
                return Snapshot(pkg, key, postedAt, title?.take(500), body.take(4000).ifBlank { null })
            }
        }
    }

    fun sha256(s: String): String = MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    /** Returns a short outcome code (used by tests/diagnostics). Never logs notification content. */
    fun capture(ctx: android.content.Context, s: Snapshot, isCurrentImport: Boolean): String {
        val prefs = Prefs(ctx)
        val owner = prefs.boundUserId
        if (!prefs.captureEnabled) return "capture_disabled"
        if (owner == null) return "no_user"
        if (s.pkg !in prefs.selectedPackages || s.pkg !in SupportedSources.all) return "source_not_selected"
        val combined = listOfNotNull(s.title, s.text).joinToString("\n")
        val pf = Prefilter.check(combined)
        if (pf != Prefilter.Result.ACCEPT) return "filtered_${pf.name.lowercase()}"
        val dao = OutboxDb.get(ctx).dao()
        if (dao.storedBytes() >= OUTBOX_LIMIT_BYTES) {
            prefs.pausedReason = "Local outbox full (50 MiB). Sync or delete pending items."
            prefs.captureEnabled = false
            return "outbox_full"
        }
        val payload = JSONObject().put("title", s.title).put("text", s.text).toString().toByteArray()
        val now = System.currentTimeMillis()
        val e = OutboxEvent(
            eventId = UUID.randomUUID().toString(),
            ownerUserId = owner,
            deviceId = prefs.installId,
            sourcePackage = s.pkg,
            sourceKeyHash = sha256(s.key).take(32),
            postedAt = s.postedAt,
            capturedAt = now,
            contentHash = sha256(s.pkg + "\u0000" + combined),
            parserVersion = PARSER_VERSION,
            payloadCipher = Crypto.encrypt(payload),
            payloadBytes = payload.size,
            preview = combined.replace(Regex("\\d{6,}"), "••••").take(80),
            timezone = prefs.timezone,
            isCurrentImport = isCurrentImport,
        )
        val row = dao.insert(e)
        if (row == -1L) return "duplicate_callback"
        prefs.lastEventAt = now
        Log.i(TAG, "captured event from ${s.pkg}")
        SyncScheduler.schedule(ctx)
        return "captured"
    }
}
