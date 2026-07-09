const withReactNativeMapsAndroidKey = require("./plugins/withReactNativeMapsAndroidKey");

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  "";
const iosGoogleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ||
  process.env.GOOGLE_MAPS_IOS_API_KEY ||
  googleMapsApiKey;
const androidGoogleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
  process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
  googleMapsApiKey;
const mapsBuildPlatform = process.env.MAPS_BUILD_PLATFORM;

function getBuildGoogleMapsApiKey() {
  if (mapsBuildPlatform === "ios") return iosGoogleMapsApiKey;
  if (mapsBuildPlatform === "android") return androidGoogleMapsApiKey;
  return googleMapsApiKey;
}

const defaultPamolProjectId = "f282a582-7512-48d6-b563-13aa571d9115";
const defaultPascalProjectId = "eb3b8747-40b2-4aad-b118-e64339bfeea0";
const defaultClientProjectId = "9932543b-f023-4dec-8213-5d0fe99ad749";
const defaultClientSlug = "a2b-lift-client-eas-mFdHJz";
const appVersion = process.env.EXPO_APP_VERSION || "1.0.11";
const currentAndroidVersionCode = Number(process.env.EXPO_ANDROID_VERSION_CODE || 110);

function getIosBuildNumber(variant, fallback) {
  const variantKey = variant === "client" ? "EXPO_CLIENT_IOS_BUILD_NUMBER" : "EXPO_DRIVER_IOS_BUILD_NUMBER";
  return process.env[variantKey] || process.env.EXPO_IOS_BUILD_NUMBER || fallback;
}

function normalizeAssetPrefix(assetPrefix = ".") {
  return String(assetPrefix || ".").replace(/\/$/, "");
}

function assetPath(assetPrefix, relativePath) {
  return `${normalizeAssetPrefix(assetPrefix)}/${relativePath}`;
}

function getDriverProjectId(owner) {
  const explicitProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (explicitProjectId) return explicitProjectId;
  return owner === "pascal225" ? defaultPascalProjectId : defaultPamolProjectId;
}

function getVariantConfig(variant) {
  if (variant === "client") {
    const owner = process.env.EXPO_PUBLIC_EAS_OWNER_CLIENT || process.env.EXPO_PUBLIC_EAS_OWNER || "a2bliftclub";
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID_CLIENT || defaultClientProjectId;
    return {
      variant,
      owner,
      projectId,
      name: "A2B LIFT",
      version: appVersion,
      slug: process.env.EXPO_PUBLIC_EAS_SLUG_CLIENT || defaultClientSlug,
      scheme: "a2bliftclient",
      iosBundleIdentifier: "com.a2blift.client",
      androidPackage: "com.a2blift.client",
      androidVersionCode: currentAndroidVersionCode,
      iosBuildNumber: getIosBuildNumber("client", "19"),
      runtimeVersion: "1.0.0-client",
      notificationChannel: "client-alerts",
    };
  }

  const owner = process.env.EXPO_PUBLIC_EAS_OWNER || "pascal225";
  return {
    variant: "driver",
    owner,
    projectId: getDriverProjectId(owner),
    name: "A2B DRIVER",
    version: appVersion,
    slug: "a2b-lift",
    scheme: "a2blift",
    iosBundleIdentifier: "com.a2blift",
    androidPackage: "com.a2blift",
    androidVersionCode: currentAndroidVersionCode,
    iosBuildNumber: getIosBuildNumber("driver", "19"),
    runtimeVersion: "1.0.44",
    notificationChannel: "ride-alerts-v3",
    icon: "assets/images/driver-icon.png",
    androidAdaptiveForeground: "assets/images/driver-android-icon-foreground.png",
  };
}

function createMobileAppConfig({ variant = "driver", assetPrefix = "." } = {}) {
  const config = getVariantConfig(variant);
  const easProjectConfig = config.projectId
    ? {
        eas: {
          projectId: config.projectId,
        },
      }
    : {};

  return withReactNativeMapsAndroidKey({
    name: config.name,
    slug: config.slug,
    owner: config.owner,
    version: config.version,
    orientation: "portrait",
    icon: assetPath(assetPrefix, config.icon || "assets/images/icon.png"),
    scheme: config.scheme,
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: assetPath(assetPrefix, "assets/images/splash-icon.png"),
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: config.iosBundleIdentifier,
      buildNumber: config.iosBuildNumber,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "A2B LIFT needs your location to show nearby drivers and navigate to your destination.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "A2B LIFT uses your location to connect you with nearby drivers and to track your trip.",
        NSCameraUsageDescription: "A2B LIFT needs camera access to let you upload your profile photo and vehicle documents.",
        NSPhotoLibraryUsageDescription: "A2B LIFT needs access to your photo library to let you upload your profile photo and vehicle documents.",
        NSPhotoLibraryAddUsageDescription: "A2B LIFT saves trip-related photos to your library.",
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["location", "fetch"],
      },
      config: {
        googleMapsApiKey: iosGoogleMapsApiKey,
      },
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
        ],
      },
    },
    android: {
      package: config.androidPackage,
      versionCode: config.androidVersionCode,
      softwareKeyboardLayoutMode: "resize",
      adaptiveIcon: {
        foregroundImage: assetPath(assetPrefix, config.androidAdaptiveForeground || "assets/images/android-icon-foreground-car.png"),
        backgroundColor: "#000000",
      },
      permissions: [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.INTERNET",
        "android.permission.VIBRATE",
        "android.permission.RECORD_AUDIO",
      ],
      config: {
        googleMaps: {
          apiKey: androidGoogleMapsApiKey,
        },
      },
    },
    web: {
      favicon: assetPath(assetPrefix, "assets/images/favicon.png"),
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser",
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            minSdkVersion: 24,
            ndkVersion: "27.1.12297006",
            buildArchs: ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"],
          },
        },
      ],
      "./plugins/with-android-release-lint-disabled",
      [
        "expo-notifications",
        {
          icon: assetPath(assetPrefix, config.notificationIcon || "assets/images/icon.png"),
          color: "#0a0a0a",
          defaultChannel: config.notificationChannel,
          sounds: [assetPath(assetPrefix, "assets/trip_alert.wav")],
          mode: "production",
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "A2B LIFT uses your location to connect you with nearby drivers and navigate your trip.",
          locationWhenInUsePermission: "A2B LIFT needs your location to show nearby drivers and navigate to your destination.",
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "A2B LIFT needs access to your photos to let you upload your profile photo and documents.",
          cameraPermission: "A2B LIFT needs camera access to let you take photos for your profile and documents.",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },
    extra: {
      ...easProjectConfig,
      appVariant: config.variant,
      googleMapsApiKey: getBuildGoogleMapsApiKey(),
      iosGoogleMapsApiKey,
      androidGoogleMapsApiKey,
    },
    runtimeVersion: config.runtimeVersion,
    ...(config.projectId
      ? {
          updates: {
            url: `https://u.expo.dev/${config.projectId}`,
          },
        }
      : {}),
  });
}

module.exports = {
  createMobileAppConfig,
};
