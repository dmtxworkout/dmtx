package com.dmtx.hlsdownloads

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * Offline HLS on Android: the chosen variant's playlists and segments are
 * copied under filesDir/hls-downloads/<id>/ with their URIs rewritten to
 * local relative names, and ExoPlayer plays the local master playlist from
 * file://. Segments already on disk are skipped, so starting the same
 * download again resumes it. The work runs in [HlsDownloadEngine], kept alive
 * in the background by [HlsDownloadService].
 */
class HlsDownloadsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("No hay contexto de la app")

  override fun definition() = ModuleDefinition {
    Name("HlsDownloads")

    Events("onProgress", "onComplete", "onError")

    Constants {
      mapOf("homeDirectory" to (appContext.reactContext?.filesDir?.absolutePath ?: ""))
    }

    OnCreate {
      HlsDownloadEngine.attach(object : HlsDownloadEngine.Listener {
        override fun onProgress(id: String, fraction: Double, bytes: Long) {
          sendEvent("onProgress", mapOf("id" to id, "fraction" to fraction, "bytes" to bytes))
        }
        override fun onComplete(id: String, location: String, bytes: Long) {
          sendEvent("onComplete", mapOf("id" to id, "location" to location, "bytes" to bytes))
        }
        override fun onError(id: String, message: String) {
          sendEvent("onError", mapOf("id" to id, "message" to message))
        }
      })
    }

    OnDestroy {
      HlsDownloadEngine.detach()
    }

    AsyncFunction("start") { id: String, url: String, maxHeight: Int, title: String ->
      requestNotificationPermission()
      HlsDownloadEngine.start(context, id, url, maxHeight, title)
    }

    AsyncFunction("cancel") { id: String ->
      HlsDownloadEngine.cancel(context, id)
    }

    AsyncFunction("remove") { location: String ->
      // The location points at the master playlist; the whole folder goes.
      val file = File(context.filesDir, location)
      (if (file.isDirectory) file else file.parentFile)?.deleteRecursively()
    }

    AsyncFunction("restore") { promise: Promise ->
      promise.resolve(HlsDownloadEngine.activeIds())
    }
  }

  /** Android 13+ shows the progress notification only once the user allows notifications; asked the first time a download starts. */
  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val activity = appContext.currentActivity ?: return
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
    ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0x4d54)
  }
}

/** One download: picks the variant, mirrors its playlists and fetches the segments a few at a time. */
internal class HlsFetcher(
  private val masterUrl: String,
  private val dir: File,
  private val maxHeight: Int,
  private val onProgress: (Double, Long) -> Unit,
) {
  private val bytes = AtomicLong(0)
  private val done = AtomicInteger(0)
  private var total = 0

  /** Returns the local master playlist name and the bytes on disk. */
  suspend fun run(): Pair<String, Long> {
    dir.mkdirs()
    val master = fetchText(masterUrl)
    val plan = planMaster(master)
    // Every media playlist first, so progress knows how many segments there are.
    val media = plan.playlists.map { p -> p to planMedia(fetchText(p.remote), p.remote, p.localPrefix) }
    total = media.sumOf { it.second.files.size }
    val gate = Semaphore(4)
    coroutineScopeOf {
      media.flatMap { (_, m) -> m.files }.map { f ->
        async {
          gate.withPermit {
            ensureActive()
            fetchFile(f.remote, File(dir, f.local))
            done.incrementAndGet()
            onProgress(if (total == 0) 1.0 else done.get().toDouble() / total, bytes.get())
          }
        }
      }.awaitAll()
    }
    for ((p, m) in media) File(dir, p.local).writeText(m.text)
    File(dir, "master.m3u8").writeText(plan.text)
    return "master.m3u8" to dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
  }

  private suspend fun coroutineScopeOf(block: suspend kotlinx.coroutines.CoroutineScope.() -> Unit) =
    kotlinx.coroutines.coroutineScope(block)

  private class Playlist(val remote: String, val local: String, val localPrefix: String)
  private class Planned(val text: String, val playlists: List<Playlist>)
  private class FileRef(val remote: String, val local: String)
  private class MediaPlan(val text: String, val files: List<FileRef>)

  private fun attr(line: String, name: String): String? {
    val m = Regex("""(?:^|,)$name=("([^"]*)"|[^,]*)""").find(line.substringAfter(':')) ?: return null
    return m.groupValues[2].ifEmpty { m.groupValues[1] }
  }

  /** Keep one video variant (the tallest at or under maxHeight) and the audio renditions it uses. */
  private fun planMaster(text: String): Planned {
    val lines = text.lines()
    data class Variant(val infoIndex: Int, val uri: String, val height: Int, val bandwidth: Long, val audio: String?)
    val variants = ArrayList<Variant>()
    var i = 0
    while (i < lines.size) {
      val line = lines[i]
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        val uri = lines.drop(i + 1).firstOrNull { it.isNotBlank() && !it.startsWith("#") } ?: ""
        val height = attr(line, "RESOLUTION")?.substringAfter('x')?.toIntOrNull() ?: 0
        val bandwidth = attr(line, "BANDWIDTH")?.toLongOrNull() ?: 0
        variants.add(Variant(i, uri, height, bandwidth, attr(line, "AUDIO")))
      }
      i++
    }
    if (variants.isEmpty()) throw IllegalStateException("La lista HLS no tiene variantes")
    val fitting = variants.filter { it.height in 1..maxHeight }
    val chosen = (fitting.ifEmpty { listOf(variants.minBy { if (it.height > 0) it.height else Int.MAX_VALUE }) }).maxBy { it.bandwidth }
    val playlists = ArrayList<Playlist>()
    val out = ArrayList<String>()
    var audioIndex = 0
    for (line in lines) {
      when {
        line.startsWith("#EXT-X-MEDIA") -> {
          val type = attr(line, "TYPE")
          val group = attr(line, "GROUP-ID")
          val uri = attr(line, "URI")
          if (type == "AUDIO" && group != null && group == chosen.audio && uri != null) {
            val local = "audio-$audioIndex.m3u8"
            playlists.add(Playlist(resolve(masterUrl, uri), local, "a$audioIndex-"))
            audioIndex++
            out.add(line.replace("URI=\"$uri\"", "URI=\"$local\""))
          }
          // Other audio groups, subtitles and closed captions are dropped.
        }
        line.startsWith("#EXT-X-STREAM-INF") || line.startsWith("#EXT-X-I-FRAME-STREAM-INF") -> {}
        line.isNotBlank() && !line.startsWith("#") -> {}
        line.startsWith("#EXT-X-SESSION") -> {}
        else -> out.add(line)
      }
    }
    var info = lines[chosen.infoIndex]
    attr(info, "SUBTITLES")?.let { info = info.replace(",SUBTITLES=\"$it\"", "").replace("SUBTITLES=\"$it\",", "") }
    attr(info, "CLOSED-CAPTIONS")?.let { info = info.replace(",CLOSED-CAPTIONS=\"$it\"", "").replace("CLOSED-CAPTIONS=\"$it\",", "") }
    out.add(info)
    out.add("video.m3u8")
    playlists.add(Playlist(resolve(masterUrl, chosen.uri), "video.m3u8", "v-"))
    return Planned(out.joinToString("\n") + "\n", playlists)
  }

  /** Rewrite a media playlist so its init sections, keys and segments point at local files. */
  private fun planMedia(text: String, base: String, prefix: String): MediaPlan {
    val files = ArrayList<FileRef>()
    var n = 0
    fun local(uri: String): String {
      val ext = uri.substringAfterLast('/').substringBefore('?').substringAfterLast('.', "bin")
      val name = "$prefix${n++}.$ext"
      files.add(FileRef(resolve(base, uri), name))
      return name
    }
    val out = text.lines().map { line ->
      when {
        line.startsWith("#EXT-X-MAP") || line.startsWith("#EXT-X-KEY") -> {
          val uri = attr(line, "URI")
          if (uri != null) line.replace("URI=\"$uri\"", "URI=\"${local(uri)}\"") else line
        }
        line.isNotBlank() && !line.startsWith("#") -> local(line.trim())
        else -> line
      }
    }
    return MediaPlan(out.joinToString("\n") + "\n", files)
  }

  private fun resolve(base: String, ref: String): String = URI(base).resolve(ref.trim()).toString()

  private fun open(url: String): HttpURLConnection {
    val c = URL(url).openConnection() as HttpURLConnection
    c.connectTimeout = 15000
    c.readTimeout = 30000
    c.instanceFollowRedirects = true
    if (c.responseCode !in 200..299) throw IllegalStateException("Cloudflare respondió ${c.responseCode}")
    return c
  }

  private fun fetchText(url: String): String {
    val c = open(url)
    try {
      return c.inputStream.bufferedReader().use { it.readText() }
    } finally {
      c.disconnect()
    }
  }

  private fun fetchFile(url: String, target: File) {
    if (target.exists() && target.length() > 0) {
      bytes.addAndGet(target.length())
      return
    }
    val tmp = File(target.path + ".part")
    val c = open(url)
    try {
      c.inputStream.use { input ->
        tmp.outputStream().use { output ->
          val buffer = ByteArray(256 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            bytes.addAndGet(read.toLong())
          }
        }
      }
      if (!tmp.renameTo(target)) throw IllegalStateException("No se pudo guardar el archivo")
    } finally {
      c.disconnect()
    }
  }
}
