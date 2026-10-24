package `in`.tinkercraft.tinkerspend.capture

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/** Exercises the actual capturer, Keystore and durable outbox with no WebView or backend. */
@RunWith(AndroidJUnit4::class)
class CapturePipelineTest {
    @Test fun captureGatesFilterAndDeduplicateBeforeEncryptedPersistence() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        require(!ApiClient(context).hasSession()) { "Run only on a signed-out test installation" }
        val prefs = Prefs(context)
        val previousOwner = prefs.boundUserId
        val previousEnabled = prefs.captureEnabled
        val previousSelected = prefs.selectedPackages
        val previousPaused = prefs.authPaused
        val previousLastEvent = prefs.lastEventAt
        val owner = "synthetic-${UUID.randomUUID()}"
        val dao = OutboxDb.get(context).dao()
        val snapshot = Capturer.Snapshot(SupportedSources.FIXTURE, owner, System.currentTimeMillis(),
            "SYNTHETIC", "Paid INR 123.45 to Synthetic Market $owner")
        try {
            prefs.authPaused = true
            prefs.captureEnabled = false
            assertEquals("capture_disabled", Capturer.capture(context, snapshot, false))
            prefs.captureEnabled = true
            prefs.boundUserId = null
            assertEquals("no_user", Capturer.capture(context, snapshot, false))
            prefs.boundUserId = owner
            prefs.selectedPackages = emptySet()
            assertEquals("source_not_selected", Capturer.capture(context, snapshot, false))
            prefs.selectedPackages = setOf(SupportedSources.FIXTURE)
            assertEquals("filtered_otp", Capturer.capture(context, snapshot.copy(text = "OTP 123456 for payment INR 123.45"), false))
            assertEquals(0, dao.pendingCount(owner))
            assertEquals("captured", Capturer.capture(context, snapshot, false))
            assertEquals("duplicate_callback", Capturer.capture(context, snapshot, false))
            assertEquals(1, dao.pendingCount(owner))
            val row = dao.recent(owner, 10).single()
            assertEquals("", row.preview)
            val payload = JSONObject(String(Crypto.decrypt(requireNotNull(row.payloadCipher)), Charsets.UTF_8))
            assertEquals(snapshot.title, payload.getString("title"))
            assertEquals(snapshot.text, payload.getString("text"))
            assertTrue(dao.recent(null, 10).isEmpty())
        } finally {
            dao.deleteAllForOwner(owner)
            prefs.captureEnabled = previousEnabled
            prefs.boundUserId = previousOwner
            prefs.selectedPackages = previousSelected
            prefs.authPaused = previousPaused
            prefs.lastEventAt = previousLastEvent
        }
    }
}
