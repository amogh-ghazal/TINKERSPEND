package `in`.tinkercraft.tinkerspend.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import `in`.tinkercraft.tinkerspend.capture.OutboxDb
import `in`.tinkercraft.tinkerspend.capture.Prefs

/** adb shell am broadcast -a in.tinkercraft.tinkerspend.DEBUG_CONFIG -p in.tinkercraft.tinkerspend --es owner test-owner --es packages in.tinkercraft.tinkerspend.fixture --ez enabled true */
class DebugConfigReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val p = Prefs(ctx)
        intent.getStringExtra("owner")?.let { p.boundUserId = it }
        intent.getStringExtra("packages")?.let { p.selectedPackages = it.split(',').filter { s -> s.isNotBlank() }.toSet() }
        if (intent.hasExtra("enabled")) p.captureEnabled = intent.getBooleanExtra("enabled", false)
        val pending = Thread { 
            val dao = OutboxDb.get(ctx).dao()
            Log.i("TSDebug", "state owner=${p.boundUserId} enabled=${p.captureEnabled} selected=${p.selectedPackages} listener=${p.listenerConnected} pending=${dao.pendingCount()} failed=${dao.failedCount()} lastEventAt=${p.lastEventAt}")
        }
        pending.start(); pending.join()
    }
}
