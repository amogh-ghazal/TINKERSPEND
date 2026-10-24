#!/usr/bin/env bash
# Stage a signed, verified APK as a Cloudflare static asset for the release build.
set -euo pipefail
cd "$(dirname "$0")/.."
APK="${1:?usage: package-android-download.sh <signed-release.apk>}"
[ -f "$APK" ] || { echo "download-package: APK not found" >&2; exit 1; }
pnpm release:check "$APK"
size="$(wc -c < "$APK" | tr -d ' ')"
[ "$size" -lt 26214400 ] || { echo "download-package: APK must be below Cloudflare's 25 MiB static-asset limit" >&2; exit 1; }
BT="$(ls -d "${ANDROID_HOME:?ANDROID_HOME unset}"/build-tools/* | sort -V | tail -1)"
version="$("$BT/aapt" dump badging "$APK" | sed -n "s/^package:.*versionName='\([^']*\)'.*/\1/p" | head -1)"
[ -n "$version" ] || { echo "download-package: could not read APK version" >&2; exit 1; }
dest="apps/client/public/downloads"
mkdir -p "$dest"
cp "$APK" "$dest/tinkerspend-${version}.apk"
cp "$APK" "$dest/tinkerspend-latest.apk"
(cd "$dest" && sha256sum "tinkerspend-${version}.apk" "tinkerspend-latest.apk" > SHA256SUMS.txt)
echo "download-package: staged signed TinkerSpend $version under /downloads/"
