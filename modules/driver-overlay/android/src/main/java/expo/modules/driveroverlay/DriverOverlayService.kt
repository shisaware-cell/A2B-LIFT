package expo.modules.driveroverlay

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.core.app.NotificationCompat
import kotlin.math.abs

class DriverOverlayService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.driveroverlay.START"
    const val ACTION_UPDATE = "expo.modules.driveroverlay.UPDATE"
    const val EXTRA_EVENT_COUNT = "eventCount"
    private const val CHANNEL_ID = "a2b_driver_overlay"
    private const val NOTIFICATION_ID = 7402
  }

  private lateinit var windowManager: WindowManager
  private var overlayView: FrameLayout? = null
  private var badgeView: TextView? = null
  private var layoutParams: WindowManager.LayoutParams? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val count = intent?.getIntExtra(EXTRA_EVENT_COUNT, 0)?.coerceAtLeast(0) ?: 0
    startForeground(NOTIFICATION_ID, buildNotification())
    if (overlayView == null) addOverlay()
    if (intent?.action == ACTION_UPDATE) {
      updateBadge(count)
      return START_STICKY
    }

    updateBadge(count)
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    overlayView?.let {
      try {
        windowManager.removeView(it)
      } catch (_: IllegalArgumentException) {
      }
    }
    overlayView = null
    badgeView = null
    super.onDestroy()
  }

  private fun addOverlay() {
    val size = dp(62)
    val container = FrameLayout(this)
    val background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.rgb(12, 12, 12))
      setStroke(dp(2), Color.WHITE)
    }
    container.background = background
    container.elevation = dp(8).toFloat()

    val icon = ImageView(this).apply {
      setImageResource(applicationInfo.icon)
      scaleType = ImageView.ScaleType.CENTER_CROP
    }
    container.addView(icon, FrameLayout.LayoutParams(dp(48), dp(48), Gravity.CENTER))

    val badge = TextView(this).apply {
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      textSize = 10f
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      setBackground(GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(211, 47, 47))
      })
      visibility = View.GONE
    }
    val badgeParams = FrameLayout.LayoutParams(dp(24), dp(24), Gravity.TOP or Gravity.END).apply {
      topMargin = -dp(2)
      marginEnd = -dp(2)
    }
    container.addView(badge, badgeParams)

    val params = WindowManager.LayoutParams(
      size,
      size,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      },
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = resources.displayMetrics.widthPixels - size - dp(16)
      y = dp(180)
    }

    attachTouchHandler(container, params)
    windowManager.addView(container, params)
    overlayView = container
    badgeView = badge
    layoutParams = params
  }

  private fun attachTouchHandler(view: View, params: WindowManager.LayoutParams) {
    var startX = 0
    var startY = 0
    var touchX = 0f
    var touchY = 0f

    view.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          startX = params.x
          startY = params.y
          touchX = event.rawX
          touchY = event.rawY
          true
        }
        MotionEvent.ACTION_MOVE -> {
          params.x = startX + (event.rawX - touchX).toInt()
          params.y = startY + (event.rawY - touchY).toInt()
          windowManager.updateViewLayout(view, params)
          true
        }
        MotionEvent.ACTION_UP -> {
          val moved = abs(event.rawX - touchX) > dp(8) || abs(event.rawY - touchY) > dp(8)
          if (!moved) openDriverApp()
          true
        }
        else -> false
      }
    }
  }

  private fun openDriverApp() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      startActivity(it)
    }
  }

  private fun updateBadge(count: Int) {
    badgeView?.apply {
      text = if (count > 99) "99+" else count.toString()
      visibility = if (count > 0) View.VISIBLE else View.GONE
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Floating driver shortcut",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Keeps the optional A2B Driver shortcut available over other apps"
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(applicationInfo.icon)
    .setContentTitle("A2B Driver shortcut is active")
    .setContentText("Tap the floating icon to return to driver mode")
    .setContentIntent(
      PendingIntent.getActivity(
        this,
        0,
        packageManager.getLaunchIntentForPackage(packageName),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      ),
    )
    .setOngoing(true)
    .setPriority(NotificationCompat.PRIORITY_LOW)
    .build()

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
