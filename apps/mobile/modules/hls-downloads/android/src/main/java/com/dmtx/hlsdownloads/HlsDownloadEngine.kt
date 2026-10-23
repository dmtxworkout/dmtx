package com.dmtx.hlsdownloads

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File
import kotlin.coroutines.cancellation.CancellationException

/**
 * The downloads in flight, shared by every instance of the module (a reload
 * of the JS side, or the app being reopened, finds them still running) and by
 * the foreground service that keeps the process alive. Results that arrive
 * while no listener is attached wait until one is.
 */
object HlsDownloadEngine {
  interface Listener {
    fun onProgress(id: String, fraction: Double, bytes: Long)
    fun onComplete(id: String, location: String, bytes: Long)
    fun onError(id: String, message: String)
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val jobs = HashMap<String, Job>()
  private val titles = HashMap<String, String>()
  private val fractions = HashMap<String, Double>()
  private val pending = ArrayList<(Listener) -> Unit>()
  private var listener: Listener? = null
  private var lastNotified = 0L
  private var serviceRunning = false

  fun attach(l: Listener) = synchronized(this) {
    listener = l
    pending.forEach { it(l) }
    pending.clear()
  }

  fun detach() = synchronized(this) { listener = null }

  fun activeIds(): List<String> = synchronized(this) { jobs.filterValues { it.isActive }.keys.toList() }

  fun start(context: Context, id: String, url: String, maxHeight: Int, title: String) {
    val app = context.applicationContext
    synchronized(this) {
      if (jobs[id]?.isActive == true) return
      titles[id] = title
      fractions[id] = 0.0
      val dir = File(app.filesDir, "hls-downloads/$id")
      jobs[id] = scope.launch {
        try {
          val result = HlsFetcher(url, dir, maxHeight) { fraction, bytes ->
            synchronized(this@HlsDownloadEngine) { fractions[id] = fraction }
            listener?.onProgress(id, fraction, bytes)
            notify(app, false)
          }.run()
          finish(app, id) { it.onComplete(id, "hls-downloads/$id/${result.first}", result.second) }
        } catch (e: CancellationException) {
          dir.deleteRecursively()
          finish(app, id, null)
        } catch (e: Throwable) {
          val message = e.message ?: "No se pudo descargar el video"
          finish(app, id) { it.onError(id, message) }
        }
      }
    }
    notify(app, true)
  }

  fun cancel(context: Context, id: String) {
    val job = synchronized(this) { jobs.remove(id) }
    if (job != null) job.cancel() else File(context.applicationContext.filesDir, "hls-downloads/$id").deleteRecursively()
    notify(context.applicationContext, true)
  }

  private fun finish(app: Context, id: String, event: ((Listener) -> Unit)?) {
    synchronized(this) {
      jobs.remove(id)
      titles.remove(id)
      fractions.remove(id)
      if (event != null) {
        val l = listener
        if (l != null) event(l) else pending.add(event)
      }
    }
    notify(app, true)
  }

  /** Keep the foreground notification in step with the queue: start it with the first download, stop it after the last. */
  private fun notify(app: Context, force: Boolean) {
    val now = System.currentTimeMillis()
    val (active, title, percent) = synchronized(this) {
      if (!force && now - lastNotified < 1000) return
      lastNotified = now
      val ids = jobs.filterValues { it.isActive }.keys.toList()
      Triple(ids.size, ids.firstOrNull()?.let { titles[it] } ?: "", ((ids.firstOrNull()?.let { fractions[it] } ?: 0.0) * 100).toInt())
    }
    if (active == 0) {
      if (serviceRunning) {
        serviceRunning = false
        HlsDownloadService.stop(app)
      }
      return
    }
    val text = if (active > 1) "$percent % · ${active - 1} más en cola" else "$percent %"
    val heading = "Descargando $title"
    if (!serviceRunning) {
      serviceRunning = true
      HlsDownloadService.start(app, heading, text, percent)
    } else {
      HlsDownloadService.update(app, heading, text, percent)
    }
  }
}
