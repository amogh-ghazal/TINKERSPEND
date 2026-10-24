package `in`.tinkercraft.tinkerspend.fixture

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Bundle

/**
 * adb shell am start -n in.tinkercraft.tinkerspend.fixture/.PostActivity --es title "..." --es text "..." [--ei id 7] [--el when 0]
 * Posts one SYNTHETIC notification and finishes.
 */
class PostActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (android.os.Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 1)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("pay", "Synthetic payments", NotificationManager.IMPORTANCE_DEFAULT))
        if (intent.getBooleanExtra("clear", false)) { nm.cancelAll(); finish(); return }
        val title = intent.getStringExtra("title")
        val text = intent.getStringExtra("text")
        if (title != null || text != null) {
            val whenMs = intent.getLongExtra("when", 0L).takeIf { it > 0 } ?: System.currentTimeMillis()
            val n = Notification.Builder(this, "pay")
                .setSmallIcon(android.R.drawable.stat_notify_more)
                .setContentTitle(title).setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setWhen(whenMs).setShowWhen(true)
                .build()
            nm.notify(intent.getIntExtra("id", (System.currentTimeMillis() % 100000).toInt()), n)
        }
        finish()
    }
}
