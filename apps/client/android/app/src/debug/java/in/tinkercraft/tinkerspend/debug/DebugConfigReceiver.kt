package `in`.tinkercraft.tinkerspend.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import `in`.tinkercraft.tinkerspend.capture.OutboxDb
import `in`.tinkercraft.tinkerspend.capture.Prefs
import `in`.tinkercraft.tinkerspend.capture.Crypto
import `in`.tinkercraft.tinkerspend.capture.SyncScheduler

/** adb shell am broadcast -a in.tinkercraft.tinkerspend.DEBUG_CONFIG -p in.tinkercraft.tinkerspend --es owner test-owner --es packages in.tinkercraft.tinkerspend.fixture --ez enabled true */
class DebugConfigReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val p = Prefs(ctx)
        intent.getStringExtra("owner")?.let { p.boundUserId = it }
        if (intent.hasExtra("automatic")) p.automaticSources = intent.getBooleanExtra("automatic", false)
        intent.getStringExtra("packages")?.let { p.selectedPackages = it.split(',').filter { s -> s.isNotBlank() }.toSet() }
        if (intent.getBooleanExtra("clear_packages", false)) p.selectedPackages = emptySet()
        if (intent.hasExtra("enabled")) p.captureEnabled = intent.getBooleanExtra("enabled", false)
        // Debug-only: inject a session minted by a local test backend (emulator sync tests without Google).
        intent.getStringExtra("token")?.let { p.sessionCipher = Crypto.encryptString(it); p.sessionExpiresAt = System.currentTimeMillis() + 86_400_000; p.authPaused = false }
        if (intent.getBooleanExtra("sync", false)) SyncScheduler.schedule(ctx, userInitiated = true)
        val pending = Thread { 
            val dao = OutboxDb.get(ctx).dao()
            Log.i("TSDebug", "state install=${p.installId} authPaused=${p.authPaused} lastSyncAt=${p.lastSyncAt} owner=${p.boundUserId} enabled=${p.captureEnabled} selected=${p.selectedPackages} listener=${p.listenerConnected} pending=${dao.pendingCount(p.boundUserId)} failed=${dao.failedCount(p.boundUserId)} lastEventAt=${p.lastEventAt}")
        }
        pending.start(); pending.join()
    }
}
