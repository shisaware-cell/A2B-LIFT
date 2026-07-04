#!/usr/bin/env bash
set -euo pipefail

PLATFORM="${1:-}"
VARIANT="${2:-}"

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "Usage: scripts/build-local-release.sh <ios|android> <driver|client>" >&2
  exit 1
fi

if [[ "$VARIANT" != "driver" && "$VARIANT" != "client" ]]; then
  echo "Usage: scripts/build-local-release.sh <ios|android> <driver|client>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROFILE="production"
APP_ROOT="apps/driver-mobile/app"
if [[ "$VARIANT" == "client" ]]; then
  PROFILE="client-production"
  APP_ROOT="apps/client-mobile/app"
fi

if [[ "$PLATFORM" == "ios" ]]; then
  node scripts/ensure-local-ios-credentials.mjs "$VARIANT"
  export MAPS_BUILD_PLATFORM=ios
else
  if [[ ! -f "credentials/android/keystore.jks" && -f "$HOME/A2B-LIFT/credentials/android/keystore.jks" ]]; then
    mkdir -p credentials/android
    cp "$HOME/A2B-LIFT/credentials/android/keystore.jks" credentials/android/keystore.jks
  fi

  if [[ ! -f "credentials/android/keystore.jks" ]]; then
    echo "Android keystore missing: credentials/android/keystore.jks" >&2
    echo "Expected source: $HOME/A2B-LIFT/credentials/android/keystore.jks" >&2
    exit 1
  fi

  export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}"
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
  export MAPS_BUILD_PLATFORM=android
fi

export APP_VARIANT="$VARIANT"
export EXPO_PUBLIC_APP_VARIANT="$VARIANT"
export EXPO_ROUTER_APP_ROOT="$APP_ROOT"
export EAS_BUILD_NO_EXPO_GO_WARNING=true
export EAS_LOCAL_BUILD_ARTIFACTS_DIR="$HOME/Desktop"

echo "Building $VARIANT $PLATFORM with profile $PROFILE..."
npx eas-cli@20.3.0 build --platform "$PLATFORM" --profile "$PROFILE" --local --clear-cache
