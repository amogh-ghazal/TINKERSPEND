# Codex Android build checkpoint — 24 October 2026, 22:08:44 IST

## Actual checks

- JDK: Android Studio JBR 21.0.10. SDK compile/target 36, app minimum 24.
- Gradle: 8.14.3 binary distribution downloaded from official Gradle/GitHub release endpoints, SHA-256 verified against Gradle's official `.sha256`: `bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531`.
- Build command with that Gradle: `gradle -I ../../../scripts/gradle/mirror.init.gradle :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :fixture:assembleDebug --console=plain --no-daemon --max-workers=2` from `apps/client/android`.
- Result: **BUILD SUCCESSFUL**, 1m 59s incremental after the initial cold build. JVM scaffold test: 1 test, zero failures/errors. This smoke test does not verify capture/Room behavior.
- `aapt2 dump badging` confirms package `in.tinkercraft.tinkerspend`, version 0.1.1, versionCode 2, target SDK 36.
- `apksigner verify --verbose --print-certs`: verifies, v2 signature true, development signer SHA-1 `1e7dc1be847ef47c49503ce1360bbe241e5bcaee`, SHA-256 `02d389cead74a486556abd7cfa0908df0cd8a1d49e2644de2dbb47b4be180abf`.
- Packaged JS/JSON/HTML assets checked for OpenAI-key-shaped strings: zero matches. This is a bounded scan, not a complete security audit.

## Artifact checksums (SHA-256)

| Artifact | SHA-256 |
|---|---|
| app-debug.apk | `fe5522188f764098cab96f1e6bc68c2037acb3e55e63779a7a895de3d62695d2` |
| app-debug-androidTest.apk | `8dc690ab3a6610b4fd7504eba97b254a9e8599e6377c6cd33f006343b9543b31` |
| fixture-debug.apk (synthetic notification poster) | `dfcff0cfdbe10dddd4e4b7cdd5328a54f83e16547dccb3ec8e5cd418f6fde426` |

Build outputs are ignored by Git and can be rebuilt with the documented commands. The owner has local exported copies in the Codex task's `outputs/TinkerSpend-0.1.1-dev` folder. They are development artifacts, not the original-key-signed release.

## Device limits / failed installation

ADB listed `emulator-5554` (virtual device reporting Android 9 and SM-S908E profile). Shell commands subsequently returned `closed`. Streaming APK install failed with `connect error for write: closed`; a targeted reconnect and non-streaming retry returned device unavailable. No app uninstall, permission grant or VM settings change was performed.

The native isolation and preview-cleanup migration tests compile into the Android test APK but were **not executed**. No local VM installation, real payment notification capture, physical-phone behavior, live Google/OpenAI or public installation result is claimed.

Native change: Room version 2 clears legacy plaintext previews, while new rows store an empty preview and encrypted payloads. Diagnostics query only the bound owner and decrypt a preview in memory on demand. Instrumentation tests cover owner/null-owner queries and the data-preserving cleanup migration when a usable test device becomes available.
