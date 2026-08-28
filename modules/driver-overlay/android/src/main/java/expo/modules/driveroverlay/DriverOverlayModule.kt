package expo.modules.driveroverlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DriverOverlayModule : Module() {
  companion object {
    private const val TAG = "DriverOverlayModule"
  }

  override fun definition() = ModuleDefinition {
    Name("DriverOverlay")

    AsyncFunction("hasPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to check overlay permission: ${e.message}")
        false
      }
    }

    AsyncFunction("requestPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
          val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}"),
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        }
        true
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to request overlay permission: ${e.message}")
        false
      }
    }

    AsyncFunction("start") { eventCount: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
          return@AsyncFunction false
        }

        val intent = Intent(context, DriverOverlayService::class.java)
          .setAction(DriverOverlayService.ACTION_START)
          .putExtra(DriverOverlayService.EXTRA_EVENT_COUNT, eventCount.coerceAtLeast(0))

        ContextCompat.startForegroundService(context, intent)
        true
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to start driver overlay service: ${e.message}")
        false
      }
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        context.stopService(Intent(context, DriverOverlayService::class.java))
        true
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to stop driver overlay service: ${e.message}")
        false
      }
    }

    AsyncFunction("setEventCount") { eventCount: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
          return@AsyncFunction false
        }

        val intent = Intent(context, DriverOverlayService::class.java)
          .setAction(DriverOverlayService.ACTION_UPDATE)
          .putExtra(DriverOverlayService.EXTRA_EVENT_COUNT, eventCount.coerceAtLeast(0))

        try {
          ContextCompat.startForegroundService(context, intent)
        } catch (e: Throwable) {
          // If starting as foreground service is not allowed from current background state, try standard startService
          context.startService(intent)
        }
        true
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to update driver overlay event count: ${e.message}")
        false
      }
    }

    AsyncFunction("setOverlayState") { eventCount: Int, tripActive: Boolean, tripLabel: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
          return@AsyncFunction false
        }

        val intent = Intent(context, DriverOverlayService::class.java)
          .setAction(DriverOverlayService.ACTION_UPDATE)
          .putExtra(DriverOverlayService.EXTRA_EVENT_COUNT, eventCount.coerceAtLeast(0))
          .putExtra(DriverOverlayService.EXTRA_TRIP_ACTIVE, tripActive)
          .putExtra(DriverOverlayService.EXTRA_TRIP_LABEL, tripLabel)

        try {
          ContextCompat.startForegroundService(context, intent)
        } catch (e: Throwable) {
          // If starting as foreground service is not allowed from current background state, try standard startService
          context.startService(intent)
        }
        true
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to update driver overlay state: ${e.message}")
        false
      }
    }
  }
}
