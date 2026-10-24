package `in`.tinkercraft.tinkerspend.capture

import android.content.Context
import `in`.tinkercraft.tinkerspend.BuildConfig
import java.net.HttpURLConnection
import java.net.URL

/** Authenticated HTTPS client bound to the configured API host and an allowlist of API paths. */
class ApiClient(private val ctx: Context) {
    data class Response(val status: Int, val body: String, val retryAfterSec: Long?)

    companion object {
        private val ALLOWED = listOf(
            Regex("^/api/v1/(health|me|settings|devices(/[A-Za-z0-9-]+)?|notifications/batch|ai/classify|drafts(/[A-Za-z0-9-]+(/(commit|ignore))?)?|drafts/(text|voice|receipt)|operations/[A-Za-z0-9-]+|transactions(/[A-Za-z0-9-]+(/(merge|unmerge|refund))?)?|category-rules(/[A-Za-z0-9-]+)?|summary|export\\.csv|account|auth/(challenge|google|logout))(\\?[A-Za-z0-9=&%._:-]*)?$")
        )
        fun isAllowedPath(path: String): Boolean = ALLOWED.any { it.matches(path) }
    }

    private fun token(): String? {
        val p = Prefs(ctx)
        val c = p.sessionCipher ?: return null
        if (p.sessionExpiresAt in 1 until System.currentTimeMillis()) return null
        return try { Crypto.decryptString(c) } catch (_: Exception) { null }
    }

    fun hasSession(): Boolean = token() != null

    fun request(method: String, path: String, body: String?, authenticated: Boolean = true): Response {
        require(method in setOf("GET", "POST", "PATCH", "DELETE")) { "method not allowed" }
        require(isAllowedPath(path)) { "path not allowed" }
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
        require(base.startsWith("https://") || (BuildConfig.DEBUG && base.startsWith("http://10.0.2.2"))) { "API must be HTTPS" }
        val conn = URL(base + path).openConnection() as HttpURLConnection
        conn.requestMethod = if (method == "PATCH") "POST" else method
        if (method == "PATCH") conn.setRequestProperty("X-HTTP-Method-Override", "PATCH")
        conn.connectTimeout = 15_000
        conn.readTimeout = 60_000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("X-Client", "android")
        if (authenticated) {
            val t = token() ?: return Response(401, """{"error":{"code":"unauthenticated","message":"No session","retryable":false,"request_id":"local"}}""", null)
            conn.setRequestProperty("Authorization", "Bearer $t")
        }
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray()) }
        }
        return try {
            val status = conn.responseCode
            val stream = if (status in 200..399) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            Response(status, text, conn.getHeaderField("Retry-After")?.toLongOrNull())
        } finally {
            conn.disconnect()
        }
    }
}
