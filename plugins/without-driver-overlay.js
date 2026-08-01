const { withAndroidManifest } = require("@expo/config-plugins");

const OVERLAY_PERMISSIONS = [
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
];

module.exports = function withoutDriverOverlay(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

    manifest["uses-permission"] = manifest["uses-permission"] || [];
    for (const permission of OVERLAY_PERMISSIONS) {
      const existing = manifest["uses-permission"].find(
        (entry) => entry?.$?.["android:name"] === permission,
      );
      if (existing) {
        existing.$["tools:node"] = "remove";
      } else {
        manifest["uses-permission"].push({
          $: {
            "android:name": permission,
            "tools:node": "remove",
          },
        });
      }
    }

    const application = manifest.application?.[0];
    if (application) {
      application.service = application.service || [];
      application.service.push({
        $: {
          "android:name": "expo.modules.driveroverlay.DriverOverlayService",
          "tools:node": "remove",
        },
      });
    }

    return modConfig;
  });
};
