package `in`.tinkercraft.tinkerspend.capture

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/** Real Android Keystore and SQLite checks; synthetic data only, no network or payment app. */
@RunWith(AndroidJUnit4::class)
class EncryptedOutboxTest {
    @Test fun ciphertextUsesFreshIvAndRejectsTampering() {
        val plain = "SYNTHETIC payment: INR 123.45".toByteArray(Charsets.UTF_8)
        val first = Crypto.encrypt(plain)
        val second = Crypto.encrypt(plain)
        assertArrayEquals(plain, Crypto.decrypt(first))
        assertArrayEquals(plain, Crypto.decrypt(second))
        assertFalse("Each encryption must use a fresh IV", first.copyOfRange(0, 12).contentEquals(second.copyOfRange(0, 12)))
        val altered = first.copyOf()
        altered[altered.lastIndex] = (altered.last().toInt() xor 1).toByte()
        var rejected = false
        try { Crypto.decrypt(altered) } catch (_: java.security.GeneralSecurityException) { rejected = true }
        assertTrue("Authenticated encryption must reject a modified tag", rejected)
    }

    @Test fun encryptedPayloadSurvivesDatabaseReopenWithoutPlaintextPreview() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "synthetic-outbox-${UUID.randomUUID()}.db"
        val plain = "SYNTHETIC unique merchant payment INR 123.45".toByteArray(Charsets.UTF_8)
        fun open() = Room.databaseBuilder(context, OutboxDb::class.java, name).build()
        var db = open()
        try {
            db.dao().insert(OutboxEvent(
                eventId = "synthetic-event", ownerUserId = "synthetic-owner", deviceId = "synthetic-device",
                sourcePackage = "synthetic.fixture", sourceKeyHash = "synthetic-key", postedAt = 1,
                capturedAt = 1, contentHash = "synthetic-hash", parserVersion = "test",
                payloadCipher = Crypto.encrypt(plain), payloadBytes = plain.size, preview = "", timezone = "Asia/Kolkata",
            ))
            db.close()
            db = open()
            val event = db.dao().duePending("synthetic-owner", 2, 5).single()
            assertEquals("", event.preview)
            assertArrayEquals(plain, Crypto.decrypt(requireNotNull(event.payloadCipher)))
            assertTrue(db.dao().duePending("other-owner", 2, 5).isEmpty())
            // Inspect persisted SQLite/WAL files as well as the row, using a unique synthetic marker.
            val marker = String(plain, Charsets.UTF_8)
            for (suffix in listOf("", "-wal", "-shm")) {
                val file = context.getDatabasePath(name + suffix)
                if (file.exists()) assertFalse("Plain payment text must not be stored in $suffix",
                    String(file.readBytes(), Charsets.ISO_8859_1).contains(marker))
            }
        } finally {
            db.close()
            context.deleteDatabase(name)
        }
    }
}
