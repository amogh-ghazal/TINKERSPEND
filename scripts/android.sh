#!/usr/bin/env bash
# usage: android.sh <debug|release|test>
# release requires TS_RELEASE_KEYSTORE (path) and ANDROID_RELEASE_KEYSTORE_PASSWORD from owner secret storage.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:?usage: android.sh <debug|release|test>}"
pnpm android:sync
cd apps/client/android
case "$MODE" in
  debug) ./gradlew :app:assembleDebug; ls -l app/build/outputs/apk/debug/*.apk ;;
  release)
    [ -n "${TS_RELEASE_KEYSTORE:-}" ] && [ -n "${ANDROID_RELEASE_KEYSTORE_PASSWORD:-}" ] || { echo "android.sh: release signing env missing" >&2; exit 1; }
    ./gradlew :app:assembleRelease
    bash ../../../scripts/release-check.sh app/build/outputs/apk/release/app-release.apk ;;
  test) ./gradlew :app:testDebugUnitTest ;;
  *) echo "unknown mode $MODE" >&2; exit 2 ;;
esac
