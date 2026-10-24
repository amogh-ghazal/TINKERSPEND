package `in`.tinkercraft.tinkerspend.plugins

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import `in`.tinkercraft.tinkerspend.capture.*

@CapacitorPlugin(name = "Capture")
class CapturePlugin : Plugin() {
    private val io = PaymentNotificationListener.executor

    private fun status(): JSObject {
        val ctx = context
        val prefs = Prefs(ctx)
        val dao = OutboxDb.get(ctx).dao()
        val granted = NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)
        return JSObject().apply {
            put("permissionGranted", granted)
            put("listenerConnected", granted && prefs.listenerConnected)
            put("lastListenerConnectAt", prefs.lastListenerConnectAt.takeIf { it > 0 })
            put("lastEventAt", prefs.lastEventAt.takeIf { it > 0 })
            put("lastSyncAt", prefs.lastSyncAt.takeIf { it > 0 })
            put("pendingCount", dao.pendingCount(prefs.boundUserId))
            put("failedCount", dao.failedCount(prefs.boundUserId))
            put("captureEnabled", prefs.captureEnabled)
            put("boundUser", prefs.boundUserId)
            put("selectedPackages", JSArray(prefs.selectedPackages.toList()))
            put("outboxBytes", dao.storedBytes())
            put("outboxLimitBytes", Capturer.OUTBOX_LIMIT_BYTES)
            put("pausedReason", prefs.pausedReason ?: if (prefs.authPaused) "Sign in again to resume sync" else null)
        }
    }

    @PluginMethod fun getStatus(call: PluginCall) = io.execute { call.resolve(status()) }

    @PluginMethod fun openNotificationAccessSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    @PluginMethod fun setCaptureEnabled(call: PluginCall) = io.execute {
        val prefs = Prefs(context)
        val enabled = call.getBoolean("enabled", false)!!
        if (enabled && prefs.boundUserId == null) { call.reject("Sign in before enabling capture", "no_user"); return@execute }
        prefs.captureEnabled = enabled
        if (enabled) prefs.pausedReason = null
        call.resolve(status())
    }

    @PluginMethod fun setSelectedPackages(call: PluginCall) = io.execute {
        val arr = call.getArray("packages", JSArray())!!
        val pkgs = (0 until arr.length()).map { arr.getString(it) }.filter { it in SupportedSources.all }.toSet()
        Prefs(context).selectedPackages = pkgs
        call.resolve(status())
    }

    @PluginMethod fun listSupportedSources(call: PluginCall) {
        val pm = context.packageManager
        val out = JSArray()
        for ((pkg, label) in SupportedSources.all) {
            val installed = try { pm.getPackageInfo(pkg, 0); true } catch (_: PackageManager.NameNotFoundException) { false }
            out.put(JSObject().put("packageName", pkg).put("label", label).put("installed", installed))
        }
        call.resolve(JSObject().put("sources", out))
    }

    @PluginMethod fun recentEvents(call: PluginCall) = io.execute {
        val limit = call.getInt("limit", 10)!!.coerceIn(1, 50)
        val owner = Prefs(context).boundUserId
        val out = JSArray()
        for (e in OutboxDb.get(context).dao().recent(owner, limit)) {
            val preview = try {
                e.payloadCipher?.let { cipher ->
                    val payload = org.json.JSONObject(String(Crypto.decrypt(cipher), Charsets.UTF_8))
                    listOfNotNull(payload.optString("title").takeUnless { it == "null" }, payload.optString("text").takeUnless { it == "null" })
                        .joinToString(" ").replace(Regex("\\d{6,}"), "••••").take(80)
                } ?: ""
            } catch (_: Exception) { "Preview unavailable" }
            out.put(JSObject().put("eventId", e.eventId).put("sourcePackage", e.sourcePackage).put("capturedAt", e.capturedAt)
                .put("state", e.ackStatus ?: e.state).put("preview", preview).put("errorCode", e.errorCode))
        }
        call.resolve(JSObject().put("events", if (Prefs(context).boundUserId == owner) out else JSArray()))
    }

    @PluginMethod fun syncNow(call: PluginCall) { Prefs(context).authPaused = false; SyncScheduler.schedule(context, userInitiated = true); call.resolve() }

    /** Offers currently visible notifications only — not historical transactions. */
    @PluginMethod fun importActiveNotifications(call: PluginCall) = io.execute {
        val svc = ListenerHolder.instance
        if (svc == null) { call.reject("Listener not connected", "not_connected"); return@execute }
        var n = 0
        for (sbn in svc.activeNotifications ?: emptyArray()) {
            val notif = sbn.notification ?: continue
            if (notif.flags and android.app.Notification.FLAG_GROUP_SUMMARY != 0) continue
            val s = Capturer.Snapshot.from(sbn.packageName, sbn.key ?: "", if (notif.`when` > 0) notif.`when` else sbn.postTime, notif) ?: continue
            if (Capturer.capture(context, s, isCurrentImport = true) == "captured") n++
        }
        call.resolve(JSObject().put("imported", n))
    }

    @PluginMethod fun deletePending(call: PluginCall) = io.execute {
        if (call.getBoolean("confirm", false) != true) { call.reject("Confirmation required", "confirm_required"); return@execute }
        val owner = Prefs(context).boundUserId ?: run { call.resolve(JSObject().put("deleted", 0)); return@execute }
        call.resolve(JSObject().put("deleted", OutboxDb.get(context).dao().deleteUnacked(owner)))
    }
}

object ListenerHolder { @Volatile var instance: PaymentNotificationListener? = null }
