package com.dmtx.hlsdownloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that runs while any download is in flight, so Android
 * keeps the process (and the coroutines in [HlsDownloadEngine]) alive when the
 * app goes to the background, with a notification showing the progress. The
 * engine starts it with the first download and stops it after the last.
 */
class HlsDownloadService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    val notification = build(this, intent?.getStringExtra(EXTRA_TITLE) ?: "Descargando", intent?.getStringExtra(EXTRA_TEXT) ?: "", intent?.getIntExtra(EXTRA_PERCENT, -1) ?: -1)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_NOT_STICKY
  }

  companion object {
    const val NOTIFICATION_ID = 0x4d54
    private const val CHANNEL = "hls-downloads"
    private const val ACTION_STOP = "com.dmtx.hlsdownloads.STOP"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_PERCENT = "percent"

    /** Start the service (or refresh its notification through it) with what is being downloaded. */
    fun start(context: Context, title: String, text: String, percent: Int) {
      val intent = Intent(context, HlsDownloadService::class.java)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
        .putExtra(EXTRA_PERCENT, percent)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    /** Refresh the notification without going through the service. */
    fun update(context: Context, title: String, text: String, percent: Int) {
      manager(context).notify(NOTIFICATION_ID, build(context, title, text, percent))
    }

    fun stop(context: Context) {
      context.startService(Intent(context, HlsDownloadService::class.java).setAction(ACTION_STOP))
    }

    private fun manager(context: Context) = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun build(context: Context, title: String, text: String, percent: Int): Notification {
      val manager = manager(context)
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        if (manager.getNotificationChannel(CHANNEL) == null) {
          manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Descargas", NotificationManager.IMPORTANCE_LOW).apply { description = "Progreso de las rutinas que se descargan" }
          )
        }
        Notification.Builder(context, CHANNEL)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        builder.setContentIntent(
          android.app.PendingIntent.getActivity(context, 0, launch, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
        )
      }
      return builder
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle(title)
        .setContentText(text)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setProgress(100, percent.coerceAtLeast(0), percent < 0)
        .build()
    }
  }
}
