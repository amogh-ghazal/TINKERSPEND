package `in`.tinkercraft.tinkerspend.capture

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import android.app.Notification
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.Person

@RunWith(AndroidJUnit4::class)
class AutomaticCaptureTest {
    @Test fun groupedMessagingNotificationsCopyOnlyBankSendersAndNeverTheOwnersReplies() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val stamp = System.currentTimeMillis()
        val style = NotificationCompat.MessagingStyle(Person.Builder().setName("SYNTHETIC owner").build())
            .setConversationTitle("Several messages")
            .addMessage("INR 100 debited", stamp, Person.Builder().setName("VM-HDFCBK-S").build())
            .addMessage("Paid INR 100 to Ravi", stamp + 1, Person.Builder().setName("Rahul").build())
            .addMessage("Paid INR 100 to Ravi", stamp + 2, null as Person?)
        val notification = NotificationCompat.Builder(context, "synthetic").setSmallIcon(android.R.drawable.stat_notify_more).setStyle(style).build()
        fun sbn() = StatusBarNotification("com.google.android.apps.messaging", context.packageName, 1, null,
            android.os.Process.myUid(), 0, 0, notification, android.os.Process.myUserHandle(), stamp)
        val listener = PaymentNotificationListener()
        val snapshots = listener.snapshots(sbn())
        assertEquals(1, snapshots.size)
        assertEquals("VM-HDFCBK-S", snapshots.single().title)
        assertEquals(stamp, snapshots.single().postedAt)
        assertEquals("INR 100 debited", snapshots.single().text)
        notification.flags = notification.flags or Notification.FLAG_GROUP_SUMMARY
        assertTrue(listener.snapshots(sbn()).isEmpty())
    }
    @Test fun globalConsentCapturesSupportedBankAlertsWithoutSourceSelectionAndIsOwnerBound() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        require(!ApiClient(context).hasSession()) { "Signed-out dedicated test installation required" }
        val p = Prefs(context)
        val oldOwner = p.boundUserId
        val oldEnabled = p.captureEnabled
        val oldSelected = p.selectedPackages
        val oldAuto = p.automaticSources
        val oldLast = p.lastEventAt
        val owner = "synthetic-auto-${UUID.randomUUID()}"
        val dao = OutboxDb.get(context).dao()
        try {
            p.boundUserId = owner; p.captureEnabled = true; p.selectedPackages = emptySet(); p.automaticSources = true
            val stamp = System.currentTimeMillis()
            fun alert(pkg: String, title: String, text: String, key: String) = Capturer.Snapshot(pkg, key, stamp, title, text)
            assertEquals("captured", Capturer.capture(context, alert("com.phonepe.app", "Paid", "Paid INR 100 to Synthetic Store", "app"), false))
            assertEquals("captured", Capturer.capture(context, alert("com.google.android.apps.messaging", "VM-HDFCBK-S", "INR 100 debited from HDFC Bank", "bank"), true))
            assertEquals("source_not_selected", Capturer.capture(context, alert("com.google.android.apps.messaging", "Rahul", "Paid INR 100 to Synthetic Store", "personal"), false))
            assertEquals("source_not_selected", Capturer.capture(context, alert("com.whatsapp", "VM-HDFCBK", "Paid INR 100 to Store", "chat"), false))
            assertEquals("filtered_otp", Capturer.capture(context, alert("com.google.android.apps.messaging", "VM-HDFCBK", "OTP 123456 for payment INR 100", "otp"), false))
            assertEquals(2, dao.pendingCount(owner))
            assertTrue(dao.recent(owner, 10).all { it.preview.isEmpty() })
            p.boundUserId = "$owner-other"
            assertFalse(p.automaticSources)
            assertEquals("consent_required", Capturer.capture(context, alert("com.phonepe.app", "Paid", "Paid INR 100 to Store", "switched"), false))
            assertEquals(0, dao.pendingCount("$owner-other"))
        } finally {
            dao.deleteAllForOwner(owner)
            p.boundUserId = oldOwner; p.captureEnabled = oldEnabled; p.selectedPackages = oldSelected; p.automaticSources = oldAuto; p.lastEventAt = oldLast
        }
    }
}
