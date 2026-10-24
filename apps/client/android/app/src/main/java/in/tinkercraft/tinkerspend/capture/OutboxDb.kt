package `in`.tinkercraft.tinkerspend.capture

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Entity(
    tableName = "outbox",
    indices = [
        Index(value = ["ownerUserId", "sourcePackage", "sourceKeyHash", "contentHash", "postedAt"], unique = true),
        Index(value = ["state", "nextAttemptAt"]),
    ]
)
data class OutboxEvent(
    @PrimaryKey val eventId: String,
    val ownerUserId: String,
    val deviceId: String,
    val sourcePackage: String,
    val sourceKeyHash: String,
    val postedAt: Long,
    val capturedAt: Long,
    val contentHash: String,
    val parserVersion: String,
    val payloadCipher: ByteArray?,
    val payloadBytes: Int,
    val preview: String,
    val timezone: String,
    val isCurrentImport: Boolean = false,
    val state: String = STATE_PENDING,
    val retryCount: Int = 0,
    val nextAttemptAt: Long = 0,
    val ackedAt: Long? = null,
    val ackStatus: String? = null,
    val errorCode: String? = null,
) {
    companion object {
        const val STATE_PENDING = "pending"
        const val STATE_ACKED = "acked"
        const val STATE_FAILED = "failed"
    }
}

@Entity(tableName = "enrich_jobs")
data class EnrichJob(
    @PrimaryKey val draftId: String,
    val ownerUserId: String,
    val operationId: String,
    val createdAt: Long,
    val state: String = "pending",
    val nextAttemptAt: Long = 0,
    val attempts: Int = 0,
    val errorCode: String? = null,
)

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insert(e: OutboxEvent): Long

    @Query("SELECT * FROM outbox WHERE state = 'pending' AND ownerUserId = :owner AND nextAttemptAt <= :now ORDER BY capturedAt LIMIT :limit")
    fun duePending(owner: String, now: Long, limit: Int): List<OutboxEvent>

    @Query("SELECT COUNT(*) FROM outbox WHERE state = 'pending' AND ownerUserId = :owner")
    fun pendingCount(owner: String?): Int

    @Query("SELECT COUNT(*) FROM outbox WHERE state = 'failed' AND ownerUserId = :owner")
    fun failedCount(owner: String?): Int

    @Query("SELECT COALESCE(SUM(payloadBytes),0) FROM outbox WHERE payloadCipher IS NOT NULL")
    fun storedBytes(): Long

    @Query("SELECT * FROM outbox WHERE ownerUserId = :owner ORDER BY capturedAt DESC LIMIT :limit")
    fun recent(owner: String?, limit: Int): List<OutboxEvent>

    @Query("UPDATE outbox SET state = 'acked', ackStatus = :status, ackedAt = :now, errorCode = NULL WHERE eventId = :id")
    fun markAcked(id: String, status: String, now: Long)

    @Query("UPDATE outbox SET state = 'failed', errorCode = :code WHERE eventId = :id")
    fun markFailed(id: String, code: String)

    @Query("UPDATE outbox SET retryCount = retryCount + 1, nextAttemptAt = :next, errorCode = :code WHERE eventId = :id")
    fun markRetry(id: String, next: Long, code: String)

    /** Short recovery window: drop acknowledged payloads, keep bounded dedupe metadata. */
    @Query("UPDATE outbox SET payloadCipher = NULL, preview = '' WHERE state = 'acked' AND ackedAt < :before")
    fun dropAckedPayloads(before: Long)

    @Query("DELETE FROM outbox WHERE state = 'acked' AND ackedAt < :before")
    fun deleteOldAcked(before: Long)

    @Query("DELETE FROM outbox WHERE ownerUserId = :owner AND state != 'acked'")
    fun deleteUnacked(owner: String): Int

    @Query("DELETE FROM outbox WHERE ownerUserId = :owner")
    fun deleteAllForOwner(owner: String): Int

    @Query("SELECT COUNT(*) FROM outbox WHERE state = 'pending' AND ownerUserId != :owner")
    fun pendingForOtherOwners(owner: String): Int

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insertJob(j: EnrichJob): Long

    @Query("SELECT * FROM enrich_jobs WHERE state = 'pending' AND ownerUserId = :owner AND nextAttemptAt <= :now ORDER BY createdAt LIMIT :limit")
    fun dueJobs(owner: String, now: Long, limit: Int): List<EnrichJob>

    @Query("DELETE FROM enrich_jobs WHERE draftId = :id")
    fun deleteJob(id: String)

    @Query("UPDATE enrich_jobs SET attempts = attempts + 1, nextAttemptAt = :next, errorCode = :code WHERE draftId = :id")
    fun deferJob(id: String, next: Long, code: String)

    @Query("UPDATE enrich_jobs SET state = 'failed', errorCode = :code WHERE draftId = :id")
    fun failJob(id: String, code: String)

    @Query("DELETE FROM enrich_jobs WHERE ownerUserId = :owner")
    fun deleteJobsForOwner(owner: String)

    @Transaction
    fun ackWithFollowUp(id: String, status: String, now: Long, job: EnrichJob?) {
        if (job != null) insertJob(job)
        markAcked(id, status, now)
    }
}

@Database(entities = [OutboxEvent::class, EnrichJob::class], version = 2, exportSchema = false)
abstract class OutboxDb : RoomDatabase() {
    abstract fun dao(): OutboxDao

    companion object {
        val CLEAR_LEGACY_PREVIEWS = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("UPDATE outbox SET preview = ''")
            }
        }
        @Volatile private var instance: OutboxDb? = null
        fun get(context: Context): OutboxDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, OutboxDb::class.java, "ts_outbox.db")
                .addMigrations(CLEAR_LEGACY_PREVIEWS).build().also { instance = it }
        }
    }
}
