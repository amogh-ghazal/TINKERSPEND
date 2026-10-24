package `in`.tinkercraft.tinkerspend.capture

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OutboxIsolationTest {
    @Test fun legacyMigrationClearsOnlyPlaintextPreviewAndKeepsEncryptedPayload() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val helper = FrameworkSQLiteOpenHelperFactory().create(SupportSQLiteOpenHelper.Configuration.builder(context)
            .name(null).callback(object : SupportSQLiteOpenHelper.Callback(1) {
                override fun onCreate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                    db.execSQL("CREATE TABLE outbox (preview TEXT NOT NULL, payloadCipher BLOB)")
                }
                override fun onUpgrade(db: androidx.sqlite.db.SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
            }).build())
        try {
            val db = helper.writableDatabase
            db.execSQL("INSERT INTO outbox (preview,payloadCipher) VALUES (?,?)", arrayOf("SYNTHETIC merchant amount", byteArrayOf(1, 2, 3)))
            OutboxDb.CLEAR_LEGACY_PREVIEWS.migrate(db)
            db.query("SELECT preview,payloadCipher FROM outbox").use { row ->
                assertTrue(row.moveToFirst())
                assertEquals("", row.getString(0))
                assertArrayEquals(byteArrayOf(1, 2, 3), row.getBlob(1))
            }
        } finally { helper.close() }
    }

    @Test fun diagnosticsAreOwnerScopedAndSignedOutQueriesAreEmpty() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val db = Room.inMemoryDatabaseBuilder(context, OutboxDb::class.java).build()
        try {
            fun event(id: String, owner: String, state: String = "pending") = OutboxEvent(
                eventId = id, ownerUserId = owner, deviceId = "synthetic-device", sourcePackage = "synthetic.fixture",
                sourceKeyHash = id, postedAt = 1, capturedAt = 1, contentHash = id, parserVersion = "test",
                payloadCipher = byteArrayOf(1), payloadBytes = 1, preview = "", timezone = "Asia/Kolkata", state = state,
            )
            val dao = db.dao()
            dao.insert(event("a", "owner-a")); dao.insert(event("b", "owner-b")); dao.insert(event("failed-b", "owner-b", "failed"))
            assertEquals(listOf("a"), dao.recent("owner-a", 10).map { it.eventId })
            assertEquals(1, dao.pendingCount("owner-a"))
            assertEquals(0, dao.failedCount("owner-a"))
            assertEquals(1, dao.failedCount("owner-b"))
            assertTrue(dao.recent(null, 10).isEmpty())
            assertEquals(0, dao.pendingCount(null))
        } finally { db.close() }
    }
}
