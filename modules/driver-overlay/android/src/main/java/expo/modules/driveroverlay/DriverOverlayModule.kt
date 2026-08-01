package expo.modules.driveroverlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DriverOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DriverOverlay")

    AsyncFunction("hasPermission") {
      val context = requireNotNull(appContext.reactContext)
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    }

    AsyncFunction("requestPermission") {
      val context = requireNotNull(appContext.reactContext)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      true
    }

    AsyncFunction("start") { eventCount: Int ->
      val context = requireNotNull(appContext.reactContext)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
        return@AsyncFunction false
      }

      val intent = Intent(context, DriverOverlayService::class.java)
        .setAction(DriverOverlayService.ACTION_START)
        .putExtra(DriverOverlayService.EXTRA_EVENT_COUNT, eventCount.coerceAtLeast(0))
      ContextCompat.startForegroundService(context, intent)
      true
    }

    AsyncFunction("stop") {
      val context = requireNotNull(appContext.reactContext)
      context.stopService(Intent(context, DriverOverlayService::class.java))
      true
    }

    AsyncFunction("setEventCount") { eventCount: Int ->
      val context = requireNotNull(appContext.reactContext)
      val intent = Intent(context, DriverOverlayService::class.java)
        .setAction(DriverOverlayService.ACTION_UPDATE)
        .putExtra(DriverOverlayService.EXTRA_EVENT_COUNT, eventCount.coerceAtLeast(0))
      ContextCompat.startForegroundService(context, intent)
      true
    }
  }
}
