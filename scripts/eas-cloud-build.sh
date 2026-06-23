#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-preview}"
PLATFORM="${2:-android}"
ACCOUNT="${3:-current}"
APP_VARIANT="${4:-driver}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEFAULT_PAMOL_PROJECT_ID="f282a582-7512-48d6-b563-13aa571d9115"
DEFAULT_CLIENT_PROJECT_ID="9932543b-f023-4dec-8213-5d0fe99ad749"

case "$ACCOUNT" in
  pascal)
    export EXPO_PUBLIC_EAS_OWNER="pascal225"
    if [[ -z "${EXPO_PUBLIC_EAS_PROJECT_ID_PASCAL:-}" ]]; then
      echo "ERROR: EXPO_PUBLIC_EAS_PROJECT_ID_PASCAL is required for pascal account builds."
      echo "Set it first, then re-run this command."
      exit 1
    fi
    export EXPO_PUBLIC_EAS_PROJECT_ID="$EXPO_PUBLIC_EAS_PROJECT_ID_PASCAL"
    ;;
  pamol)
    export EXPO_PUBLIC_EAS_OWNER="pamol-digital"
    export EXPO_PUBLIC_EAS_PROJECT_ID="${EXPO_PUBLIC_EAS_PROJECT_ID:-$DEFAULT_PAMOL_PROJECT_ID}"
    ;;
  current)
    # Use currently exported environment variables or app.config.js defaults.
    ;;
  *)
    echo "ERROR: Unknown account '$ACCOUNT'. Use one of: current, pamol, pascal"
    exit 1
    ;;
esac

case "$APP_VARIANT" in
  driver)
    export APP_VARIANT="driver"
    export EXPO_PUBLIC_APP_VARIANT="driver"
    export EXPO_ROUTER_APP_ROOT="apps/driver-mobile/app"
    ;;
  client)
    export APP_VARIANT="client"
    export EXPO_PUBLIC_APP_VARIANT="client"
    export EXPO_ROUTER_APP_ROOT="apps/client-mobile/app"
    export EXPO_PUBLIC_EAS_OWNER_CLIENT="${EXPO_PUBLIC_EAS_OWNER_CLIENT:-a2bliftclub}"
    export EXPO_PUBLIC_EAS_PROJECT_ID_CLIENT="${EXPO_PUBLIC_EAS_PROJECT_ID_CLIENT:-$DEFAULT_CLIENT_PROJECT_ID}"
    ;;
  *)
    echo "ERROR: Unknown app variant '$APP_VARIANT'. Use one of: driver, client"
    exit 1
    ;;
esac

echo "Starting EAS cloud build"
echo "Project directory: $PROJECT_DIR"
echo "Profile: $PROFILE"
echo "Platform: $PLATFORM"
echo "App variant: $APP_VARIANT"
echo "Router app root: $EXPO_ROUTER_APP_ROOT"
echo "EAS owner: ${EXPO_PUBLIC_EAS_OWNER:-from app.config.js default}"
echo "EAS project id: ${EXPO_PUBLIC_EAS_PROJECT_ID:-from app.config.js default}"

cd "$PROJECT_DIR"

eas build \
  --platform "$PLATFORM" \
  --profile "$PROFILE" \
  --non-interactive
