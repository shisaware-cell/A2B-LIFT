#!/usr/bin/env bash
set -euo pipefail

PLATFORM="${1:-}"
VARIANT="${2:-}"
ARCHIVE_PATH="${3:-}"

if [[ "$PLATFORM" != "ios" ]]; then
  echo "Usage: scripts/submit-local-release.sh ios <driver|client> <path-to-ipa>" >&2
  exit 1
fi

if [[ "$VARIANT" != "driver" && "$VARIANT" != "client" ]]; then
  echo "Usage: scripts/submit-local-release.sh ios <driver|client> <path-to-ipa>" >&2
  exit 1
fi

if [[ -z "$ARCHIVE_PATH" || ! -f "$ARCHIVE_PATH" ]]; then
  echo "IPA not found: $ARCHIVE_PATH" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_BUNDLE="com.a2blift"
PROFILE="production"
APP_ROOT="apps/driver-mobile/app"
if [[ "$VARIANT" == "client" ]]; then
  EXPECTED_BUNDLE="com.a2blift.client"
  PROFILE="client-production"
  APP_ROOT="apps/client-mobile/app"
fi

INFO_JSON="$(unzip -p "$ARCHIVE_PATH" 'Payload/*.app/Info.plist' | plutil -convert json -o - -)"
BUNDLE_ID="$(printf '%s' "$INFO_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).CFBundleIdentifier || ""));')"
APP_NAME="$(printf '%s' "$INFO_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(j.CFBundleDisplayName || j.CFBundleName || "");});')"
APP_VERSION="$(printf '%s' "$INFO_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(`${j.CFBundleShortVersionString || ""} (${j.CFBundleVersion || ""})`);});')"

echo "IPA: $ARCHIVE_PATH"
echo "Detected: $APP_NAME | $BUNDLE_ID | $APP_VERSION"
echo "Target: $VARIANT | $EXPECTED_BUNDLE"

if [[ "$BUNDLE_ID" != "$EXPECTED_BUNDLE" ]]; then
  echo "Refusing to submit: IPA bundle '$BUNDLE_ID' does not match target '$EXPECTED_BUNDLE'." >&2
  exit 1
fi

export APP_VARIANT="$VARIANT"
export EXPO_PUBLIC_APP_VARIANT="$VARIANT"
export EXPO_ROUTER_APP_ROOT="$APP_ROOT"

npx eas-cli@20.3.0 submit --platform ios --profile "$PROFILE" --path "$ARCHIVE_PATH"
