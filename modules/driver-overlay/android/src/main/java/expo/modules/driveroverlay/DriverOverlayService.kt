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
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.animation.AlphaAnimation
import android.view.animation.Animation
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
    const val EXTRA_TRIP_ACTIVE = "tripActive"
    const val EXTRA_TRIP_LABEL = "tripLabel"
    private const val CHANNEL_ID = "a2b_driver_overlay"
    private const val NOTIFICATION_ID = 7402
  }

  private lateinit var windowManager: WindowManager
  private var overlayView: FrameLayout? = null
  private var badgeView: TextView? = null
  private var liveDotView: View? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var blinkAnimation: Animation? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val count = intent?.getIntExtra(EXTRA_EVENT_COUNT, 0)?.coerceAtLeast(0) ?: 0
    val tripActive = intent?.getBooleanExtra(EXTRA_TRIP_ACTIVE, false) ?: false
    val tripLabel = intent?.getStringExtra(EXTRA_TRIP_LABEL) ?: ""

    startForeground(NOTIFICATION_ID, buildNotification(isIncomingTrip = count > 0 && !tripActive, isTripActive = tripActive, tripLabel = tripLabel))
    if (overlayView == null) addOverlay()
    updateOverlayState(count, tripActive, tripLabel)
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    liveDotView?.clearAnimation()
    overlayView?.let {
      try {
        windowManager.removeView(it)
      } catch (e: IllegalArgumentException) {
      }
    }
    overlayView = null
    badgeView = null
    liveDotView = null
    super.onDestroy()
  }

  private fun addOverlay() {
    val size = dp(64)
    val container = FrameLayout(this).apply {
      outlineProvider = ViewOutlineProvider.BACKGROUND
      clipToOutline = true
      elevation = dp(8).toFloat()
    }
    val containerBg = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.rgb(15, 23, 42))
      setStroke(dp(2), Color.WHITE)
    }
    container.background = containerBg

    // Circular icon wrapper to ensure square app icons never bleed outside the circle
    val iconContainer = FrameLayout(this).apply {
      setBackground(GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(10, 10, 10))
      })
      outlineProvider = ViewOutlineProvider.BACKGROUND
      clipToOutline = true
    }
    val icon = ImageView(this).apply {
      setImageResource(applicationInfo.icon)
      scaleType = ImageView.ScaleType.FIT_CENTER
      setPadding(dp(3), dp(3), dp(3), dp(3))
    }
    iconContainer.addView(icon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    container.addView(iconContainer, FrameLayout.LayoutParams(dp(46), dp(46), Gravity.CENTER))

    // Live blinking green dot for active trips
    val liveDot = View(this).apply {
      setBackground(GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(34, 197, 94))
        setStroke(dp(1), Color.WHITE)
      })
      visibility = View.GONE
    }
    val liveDotParams = FrameLayout.LayoutParams(dp(12), dp(12), Gravity.TOP or Gravity.START).apply {
      topMargin = dp(4)
      marginStart = dp(4)
    }
    container.addView(liveDot, liveDotParams)
    liveDotView = liveDot

    // Badge indicator (for "NEW", "TRIP", or event counts)
    val badge = TextView(this).apply {
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      textSize = 9f
      setPadding(dp(4), dp(1), dp(4), dp(1))
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      setBackground(GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(6).toFloat()
        setColor(Color.rgb(211, 47, 47))
      })
      visibility = View.GONE
    }
    val badgeParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(18), Gravity.TOP or Gravity.END).apply {
      topMargin = dp(1)
      marginEnd = dp(1)
    }
    container.addView(badge, badgeParams)
    badgeView = badge

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

  private fun updateOverlayState(count: Int, tripActive: Boolean, tripLabel: String) {
    val isIncomingTrip = count > 0 && !tripActive

    if (tripActive) {
      // 1. ACTIVE TRIP STATE: Live blinking green dot & green border
      liveDotView?.apply {
        visibility = View.VISIBLE
        if (blinkAnimation == null) {
          blinkAnimation = AlphaAnimation(0.2f, 1.0f).apply {
            duration = 650
            repeatCount = Animation.INFINITE
            repeatMode = Animation.REVERSE
          }
        }
        startAnimation(blinkAnimation)
      }
      badgeView?.apply {
        text = if (tripLabel.isNotEmpty()) tripLabel else "TRIP"
        setBackground(GradientDrawable().apply {
          shape = GradientDrawable.RECTANGLE
          cornerRadius = dp(6).toFloat()
          setColor(Color.rgb(16, 185, 129)) // Emerald #10B981
        })
        visibility = View.VISIBLE
      }
      overlayView?.background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(15, 23, 42))
        setStroke(dp(3), Color.rgb(16, 185, 129))
      }
    } else if (isIncomingTrip) {
      // 2. INCOMING TRIP STATE: Glowing green alert border & "NEW" badge
      liveDotView?.apply {
        clearAnimation()
        visibility = View.GONE
      }
      badgeView?.apply {
        text = "NEW"
        setBackground(GradientDrawable().apply {
          shape = GradientDrawable.RECTANGLE
          cornerRadius = dp(6).toFloat()
          setColor(Color.rgb(34, 197, 94)) // Bright green #22C55E
        })
        visibility = View.VISIBLE
      }
      overlayView?.background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(15, 23, 42))
        setStroke(dp(3), Color.rgb(34, 197, 94))
      }
    } else {
      // 3. IDLE STATE: Clean white border, no badge
      liveDotView?.apply {
        clearAnimation()
        visibility = View.GONE
      }
      badgeView?.apply {
        text = if (count > 99) "99+" else count.toString()
        setBackground(GradientDrawable().apply {
          shape = GradientDrawable.RECTANGLE
          cornerRadius = dp(6).toFloat()
          setColor(Color.rgb(211, 47, 47))
        })
        visibility = if (count > 0) View.VISIBLE else View.GONE
      }
      overlayView?.background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(15, 23, 42))
        setStroke(dp(2), Color.WHITE)
      }
    }

    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.notify(NOTIFICATION_ID, buildNotification(isIncomingTrip, tripActive, tripLabel))
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

  private fun buildNotification(
    isIncomingTrip: Boolean = false,
    isTripActive: Boolean = false,
    tripLabel: String = "",
  ) = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(applicationInfo.icon)
    .setContentTitle(
      when {
        isIncomingTrip -> "🚗 Incoming Trip Request!"
        isTripActive -> "🚗 Trip in Progress (${if (tripLabel.isNotEmpty()) tripLabel else "Active"})"
        else -> "A2B Driver shortcut is active"
      }
    )
    .setContentText(
      when {
        isIncomingTrip -> "New ride offer received — Tap to view & accept"
        isTripActive -> "Tap to open navigation and view trip details"
        else -> "Tap the floating icon to return to driver mode"
      }
    )
    .setContentIntent(
      PendingIntent.getActivity(
        this,
        0,
        packageManager.getLaunchIntentForPackage(packageName),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      ),
    )
    .setOngoing(true)
    .setPriority(if (isIncomingTrip || isTripActive) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
    .build()

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
