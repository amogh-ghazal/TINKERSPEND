#!/usr/bin/env bash
# Verifies a release APK: release signer, v2 signature, no debuggable/cleartext, no secrets or debug host inside.
set -euo pipefail
APK="${1:?usage: release-check.sh <app-release.apk>}"
EXPECTED_SHA1="${TS_RELEASE_SHA1:-814800d83ae44ba90499ee2f525d7c266181b8d8}"
BT="$(ls -d "${ANDROID_HOME:?ANDROID_HOME unset}"/build-tools/* | sort -V | tail -1)"
fail() { echo "release-check: FAIL $*" >&2; exit 1; }
certs="$("$BT/apksigner" verify --print-certs -v "$APK")" || fail "signature invalid"
grep -q "Verified using v2 scheme (APK Signature Scheme v2): true" <<<"$certs" || fail "no v2 signature"
grep -qi "certificate SHA-1 digest: $EXPECTED_SHA1" <<<"$certs" || fail "not signed with release key"
man="$("$BT/aapt2" dump xmltree --file AndroidManifest.xml "$APK")"
grep -q 'debuggable(0x0101000f)=true' <<<"$man" && fail "debuggable"
grep -q 'usesCleartextTraffic(0x010104ec)=true' <<<"$man" && fail "cleartext traffic"
grep -q 'allowBackup(0x01010280)=false' <<<"$man" || fail "backup not disabled"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
unzip -q "$APK" -d "$tmp"
if grep -rlaE 'sk-(proj-)?[A-Za-z0-9_-]{20,}|OPENAI_API_KEY|BEGIN [A-Z ]*PRIVATE KEY|10\.0\.2\.2' "$tmp" >/dev/null; then fail "secret or debug host found in APK"; fi
echo "release-check: ok  sha256=$(sha256sum "$APK" | cut -d' ' -f1)"
