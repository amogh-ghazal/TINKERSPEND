package `in`.tinkercraft.tinkerspend.plugins

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import `in`.tinkercraft.tinkerspend.BuildConfig
import `in`.tinkercraft.tinkerspend.capture.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Native Google sign-in + session storage. The app session token never crosses into JavaScript;
 * JS gets only narrowly scoped request() calls restricted to the API host/paths.
 */
@CapacitorPlugin(name = "AuthBridge")
class AuthBridgePlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.Main)

    @PluginMethod fun hasSession(call: PluginCall) {
        val p = Prefs(context)
        val signed = ApiClient(context).hasSession()
        call.resolve(JSObject().put("signedIn", signed).put("userId", if (signed) p.boundUserId else null).put("expiresAt", p.sessionExpiresAt.takeIf { it > 0 }))
    }

    @PluginMethod fun getInstallId(call: PluginCall) = call.resolve(JSObject().put("installId", Prefs(context).installId))

    @PluginMethod fun pendingForOtherAccounts(call: PluginCall) = PaymentNotificationListener.executor.execute {
        val owner = Prefs(context).boundUserId ?: ""
        call.resolve(JSObject().put("count", OutboxDb.get(context).dao().pendingForOtherOwners(owner)))
    }

    @PluginMethod fun signIn(call: PluginCall) {
        if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isBlank()) { call.reject("Google client ID not configured in this build", "not_configured"); return }
        scope.launch {
            try {
                val api = ApiClient(context)
                val prefs = Prefs(context)
                val ch = withContext(Dispatchers.IO) {
                    api.request("POST", "/api/v1/auth/challenge", JSONObject().put("client", "android").put("install_id", prefs.installId).toString(), authenticated = false)
                }
                if (ch.status != 200) { call.reject("Challenge failed (${ch.status})", "challenge_failed"); return@launch }
                val chJson = JSONObject(ch.body)
                val option = GetGoogleIdOption.Builder()
                    .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                    .setFilterByAuthorizedAccounts(false)
                    .setNonce(chJson.getString("nonce"))
                    .build()
                val result = CredentialManager.create(activity).getCredential(activity, GetCredentialRequest.Builder().addCredentialOption(option).build())
                val cred = result.credential
                if (cred !is CustomCredential || cred.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) { call.reject("Unexpected credential", "bad_credential"); return@launch }
                val idToken = GoogleIdTokenCredential.createFrom(cred.data).idToken
                val login = withContext(Dispatchers.IO) {
                    api.request("POST", "/api/v1/auth/google", JSONObject().put("challenge_id", chJson.getString("challenge_id")).put("id_token", idToken)
                        .put("client", "android").put("install_id", prefs.installId).put("device_label", android.os.Build.MODEL.take(60)).toString(), authenticated = false)
                }
                if (login.status != 200) { call.reject("Sign-in rejected (${login.status})", JSONObject(login.body).optJSONObject("error")?.optString("code") ?: "rejected"); return@launch }
                val lj = JSONObject(login.body)
                val userId = lj.getJSONObject("user").getString("id")
                withContext(Dispatchers.IO) {
                    prefs.sessionCipher = Crypto.encryptString(lj.getString("token"))
                    prefs.sessionExpiresAt = lj.getLong("expires_at")
                    prefs.boundUserId = userId
                    prefs.authPaused = false
                }
                SyncScheduler.schedule(context)
                call.resolve(JSObject().put("user", JSObject(lj.getJSONObject("user").toString())))
            } catch (e: GetCredentialException) {
                call.reject("Google sign-in cancelled or unavailable", "credential_error")
            } catch (e: Exception) {
                call.reject("Sign-in failed", "sign_in_failed")
            }
        }
    }

    /** Logout/account change: pause capture+sync, drop credentials; caller chooses to purge or retain (encrypted, tied to this account) pending items. */
    @PluginMethod fun clearSession(call: PluginCall) = PaymentNotificationListener.executor.execute {
        val prefs = Prefs(context)
        val purge = call.getBoolean("purgePending", false) == true
        val owner = prefs.boundUserId
        try { if (ApiClient(context).hasSession()) ApiClient(context).request("POST", "/api/v1/auth/logout", "{}") } catch (_: Exception) {}
        SyncScheduler.cancel(context)
        if (purge && owner != null) { OutboxDb.get(context).dao().deleteAllForOwner(owner); OutboxDb.get(context).dao().deleteJobsForOwner(owner) }
        prefs.clearSession()
        call.resolve()
    }

    @PluginMethod fun request(call: PluginCall) = PaymentNotificationListener.executor.let {
        val method = call.getString("method", "GET")!!
        val path = call.getString("path", "")!!
        if (!ApiClient.isAllowedPath(path)) { call.reject("Path not allowed", "path_not_allowed"); return@let }
        Thread {
            try {
                val r = ApiClient(context).request(method, path, call.getString("body"))
                if (r.status == 401) Prefs(context).authPaused = true
                call.resolve(JSObject().put("status", r.status).put("body", r.body))
            } catch (e: Exception) {
                call.reject("Network error", "network_error")
            }
        }.start()
    }
}
