package `in`.tinkercraft.tinkerspend.plugins

import android.Manifest
import android.media.MediaRecorder
import android.os.Build
import android.util.Base64
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File

/** Tap-to-record AAC/M4A into app-private cache, ≤60 s. Microphone permission is requested only on use. */
@CapacitorPlugin(name = "Recorder", permissions = [Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO])])
class RecorderPlugin : Plugin() {
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L

    @PluginMethod fun start(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) { requestPermissionForAlias("microphone", call, "afterPermission"); return }
        doStart(call)
    }

    @PermissionCallback private fun afterPermission(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) doStart(call) else call.reject("Microphone permission denied", "permission_denied")
    }

    private fun doStart(call: PluginCall) {
        try {
            cleanup()
            val f = File(context.cacheDir, "voice-${System.currentTimeMillis()}.m4a")
            val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(16000)
            r.setAudioEncodingBitRate(32000)
            r.setMaxDuration(60_000)
            r.setOutputFile(f.absolutePath)
            r.prepare(); r.start()
            recorder = r; file = f; startedAt = System.currentTimeMillis()
            call.resolve()
        } catch (e: Exception) { cleanup(); call.reject("Could not start recording", "recorder_error") }
    }

    @PluginMethod fun stop(call: PluginCall) {
        val r = recorder ?: run { call.reject("Not recording", "not_recording"); return }
        val f = file!!
        val duration = System.currentTimeMillis() - startedAt
        try { r.stop() } catch (_: Exception) { cleanup(); call.reject("Recording too short", "too_short"); return }
        r.release(); recorder = null
        if (f.length() > 3L * 1024 * 1024) { f.delete(); call.reject("Recording exceeds 3 MiB", "too_large"); return }
        val b64 = Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
        f.delete() // temporary audio removed once handed to the UI draft
        call.resolve(JSObject().put("base64", b64).put("mimeType", "audio/mp4").put("durationMs", duration.coerceAtMost(60_000)))
    }

    @PluginMethod fun cancel(call: PluginCall) { cleanup(); call.resolve() }

    private fun cleanup() {
        try { recorder?.stop() } catch (_: Exception) {}
        recorder?.release(); recorder = null
        file?.delete(); file = null
    }
}
