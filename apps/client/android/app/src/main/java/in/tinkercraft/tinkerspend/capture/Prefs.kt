package `in`.tinkercraft.tinkerspend.capture

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/** Non-secret capture/sync state. The session token is stored only as Keystore ciphertext. */
class Prefs(context: Context) {
    private val p: SharedPreferences = context.applicationContext.getSharedPreferences("ts_state", Context.MODE_PRIVATE)

    val installId: String
        get() = p.getString("install_id", null) ?: UUID.randomUUID().toString().also { p.edit().putString("install_id", it).apply() }

    var captureEnabled: Boolean
        get() = p.getBoolean("capture_enabled", false)
        set(v) = p.edit().putBoolean("capture_enabled", v).apply()

    var selectedPackages: Set<String>
        get() = p.getStringSet("selected_packages", emptySet())!!.toSet()
        set(v) = p.edit().putStringSet("selected_packages", v).apply()

    var boundUserId: String?
        get() = p.getString("bound_user", null)
        set(v) = p.edit().putString("bound_user", v).apply()

    var listenerConnected: Boolean
        get() = p.getBoolean("listener_connected", false)
        set(v) = p.edit().putBoolean("listener_connected", v).apply()

    var lastListenerConnectAt: Long
        get() = p.getLong("last_listener_connect", 0)
        set(v) = p.edit().putLong("last_listener_connect", v).apply()

    var lastEventAt: Long
        get() = p.getLong("last_event", 0)
        set(v) = p.edit().putLong("last_event", v).apply()

    var lastSyncAt: Long
        get() = p.getLong("last_sync", 0)
        set(v) = p.edit().putLong("last_sync", v).apply()

    var pausedReason: String?
        get() = p.getString("paused_reason", null)
        set(v) = p.edit().putString("paused_reason", v).apply()

    var authPaused: Boolean
        get() = p.getBoolean("auth_paused", false)
        set(v) = p.edit().putBoolean("auth_paused", v).apply()

    var sessionCipher: String?
        get() = p.getString("session_cipher", null)
        set(v) = p.edit().putString("session_cipher", v).apply()

    var sessionExpiresAt: Long
        get() = p.getLong("session_expires", 0)
        set(v) = p.edit().putLong("session_expires", v).apply()

    var timezone: String
        get() = p.getString("timezone", "Asia/Kolkata")!!
        set(v) = p.edit().putString("timezone", v).apply()

    fun clearSession() {
        p.edit().remove("session_cipher").remove("session_expires").remove("bound_user").putBoolean("capture_enabled", false).apply()
    }
}
