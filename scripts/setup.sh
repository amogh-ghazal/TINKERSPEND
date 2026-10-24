#!/usr/bin/env bash
# Installs pinned workspace dependencies and checks the toolchain (Node 22+, pnpm 11, JDK 21, Android SDK 36).
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || { echo "setup: Node 22+ required (found $(node -v))" >&2; exit 1; }
command -v pnpm >/dev/null || corepack enable
pnpm install --frozen-lockfile
if command -v java >/dev/null; then java -version 2>&1 | head -1; else echo "setup: JDK 21 not found (needed for Android only)"; fi
[ -n "${ANDROID_HOME:-}" ] && echo "setup: ANDROID_HOME=$ANDROID_HOME" || echo "setup: ANDROID_HOME unset (needed for Android only)"
pnpm exec playwright install chromium >/dev/null 2>&1 || echo "setup: playwright browser not installed (needed for e2e only)"
echo "setup: ok"
