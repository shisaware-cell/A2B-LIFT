#!/usr/bin/env bash
# A2B LIFT release guard (EAS cloud builds & store submits).
# Always use this instead of calling `eas build` / `eas submit` directly —
# it exports the correct env per app variant and refuses to run if the
# resolved bundle ID doesn't match the target, so a client build can never
# land under the driver app (or vice versa).
#
# Usage:
#   bash scripts/release.sh <driver|client> <ios|android> <build|submit>

set -euo pipefail

VARIANT="${1:?Usage: release.sh <driver|client> <ios|android> <build|submit>}"
PLATFORM="${2:?Usage: release.sh <driver|client> <ios|android> <build|submit>}"
ACTION="${3:?Usage: release.sh <driver|client> <ios|android> <build|submit>}"

DRIVER_PROJECT_ID="8ccd04f4-997e-44f6-9a40-bac2550cb75f"
CLIENT_PROJECT_ID="9932543b-f023-4dec-8213-5d0fe99ad749"
DRIVER_ASC_APP_ID="6779553841"   # A2B DRIVER  (com.a2blift)
CLIENT_ASC_APP_ID="6779557968"   # A2B LIFT client (com.a2blift.client)

case "$VARIANT" in
  driver)
    export APP_VARIANT="driver"
    export EXPO_PUBLIC_APP_VARIANT="driver"
    export EXPO_ROUTER_APP_ROOT="apps/driver-mobile/app"
    export EXPO_PUBLIC_EAS_OWNER="a2bliftclub"
    export EXPO_PUBLIC_EAS_PROJECT_ID="$DRIVER_PROJECT_ID"
    BUILD_PROFILE_ANDROID="production"
    PROFILE_IOS="ios-production"
    EXPECTED_BUNDLE_ID="com.a2blift"
    EXPECTED_ASC_APP_ID="$DRIVER_ASC_APP_ID"
    ;;
  client)
    export APP_VARIANT="client"
    export EXPO_PUBLIC_APP_VARIANT="client"
    export EXPO_ROUTER_APP_ROOT="apps/client-mobile/app"
    export EXPO_PUBLIC_EAS_OWNER_CLIENT="a2bliftclub"
    export EXPO_PUBLIC_EAS_PROJECT_ID_CLIENT="$CLIENT_PROJECT_ID"
    BUILD_PROFILE_ANDROID="client-production"
    PROFILE_IOS="client-ios-production"
    EXPECTED_BUNDLE_ID="com.a2blift.client"
    EXPECTED_ASC_APP_ID="$CLIENT_ASC_APP_ID"
    ;;
  *)
    echo "ERROR: unknown variant '$VARIANT' (use driver or client)"; exit 1 ;;
esac

# --- Guard: confirm the resolved app config matches the intended target ---
RESOLVED_BUNDLE_ID="$(node -e "
  const cfg = require('./app.config.js')();
  console.log(cfg.ios.bundleIdentifier);
")"
if [[ "$RESOLVED_BUNDLE_ID" != "$EXPECTED_BUNDLE_ID" ]]; then
  echo "ABORT: resolved bundle id '$RESOLVED_BUNDLE_ID' != expected '$EXPECTED_BUNDLE_ID'."
  echo "Environment is wrong — refusing to $ACTION."
  exit 1
fi

RESOLVED_VERSIONS="$(node -e "
  const cfg = require('./app.config.js')();
  console.log('version ' + cfg.version + ' | iosBuildNumber ' + cfg.ios.buildNumber + ' | androidVersionCode ' + cfg.android.versionCode);
")"

echo "──────────────────────────────────────────────"
echo " Target   : $VARIANT ($EXPECTED_BUNDLE_ID)"
echo " Platform : $PLATFORM | Action: $ACTION"
echo " $RESOLVED_VERSIONS"
[[ "$PLATFORM" == "ios" ]] && echo " ASC app  : $EXPECTED_ASC_APP_ID"
echo "──────────────────────────────────────────────"

case "$PLATFORM-$ACTION" in
  android-build)
    npx eas-cli build --platform android --profile "$BUILD_PROFILE_ANDROID" --non-interactive
    ;;
  ios-build)
    npx eas-cli build --platform ios --profile "$PROFILE_IOS" --non-interactive
    ;;
  ios-submit)
    npx eas-cli submit --platform ios --profile "$PROFILE_IOS" --latest --non-interactive
    ;;
  android-submit)
    npx eas-cli submit --platform android --profile "$BUILD_PROFILE_ANDROID" --latest --non-interactive
    ;;
  *)
    echo "ERROR: unsupported combination '$PLATFORM $ACTION'"; exit 1 ;;
esac
