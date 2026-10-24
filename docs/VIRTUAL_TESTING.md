# Virtual Android checks

These checks use a dedicated Android SDK AVD named `TinkerSpend_Codex_API36`, not a personal phone or the owner's existing BlueStacks instance. The Android SDK emulator is free. The AOSP API 36 x86_64 image does not contain Google Play services; real Google sign-in is therefore outside this test environment.

## Run

Build the debug app, synthetic notification fixture and instrumentation APK with JDK 21 / SDK 36 using the Android build instructions in the README. Start the dedicated AVD, then use its actual serial from `adb devices -l`:

```powershell
./scripts/test-android-emulator.ps1 -Serial emulator-5556
./scripts/test-android-automatic-capture.ps1 -Serial emulator-5556
./scripts/test-android-emulator-lifecycle.ps1 -Serial emulator-5556
```

The serial above is an example. The first script checks the AVD name and `ro.kernel.qemu` before installing anything or changing notification access. It refuses other devices. It installs the three debug packages, runs the Android instrumentation suite, binds a synthetic owner, selects only the synthetic fixture source, grants listener access and fixture notification permission, and posts synthetic payment/OTP/promotion notifications. It expects one queued payment and no duplicate or filtered-message rows. It does not launch the app's MainActivity or require an API key. Start with a signed-out test installation; the capture instrumentation deliberately refuses an existing session. The lifecycle script then checks zero MainActivity task entries, kills only the app's debug process, revokes/regrants its listener access and reboots only the dedicated AVD, asserting persisted queue counts and new capture. Run these before opening MainActivity.

For native sync, build a **separate local-test debug APK** with `$env:TS_API_BASE_URL_DEBUG='http://10.0.2.2:8787'` before Gradle runs. Run `node scripts/e2e-server.mjs` in another terminal (fresh disposable local D1, loopback only), then run `./scripts/test-android-emulator-sync.ps1 -Serial emulator-5556`. The sync runner requires loopback backend health to report `env=test`; it uses the existing test-only identity verifier, binds a fresh synthetic identity and asserts one pending ₹700 transaction becomes successful with the same ID and a fully acknowledged current-owner outbox. It does not authenticate with Google or call OpenAI. Stop the test server after use. Never deploy its test identity verifier or distribute the localhost-configured APK as a production app. Unset `TS_API_BASE_URL_DEBUG` and rebuild to restore the normal HTTPS default.

The eight instrumentation tests cover the target package smoke check, owner-scoped diagnostics, legacy preview cleanup, real Android Keystore encryption with fresh IVs/tamper rejection, Room close/reopen with encrypted payload recovery/plaintext-marker scan, actual capture gates/filter/deduplication, owner-bound global consent, and grouped messaging alerts excluding personal senders/owner replies. Tests use unique synthetic owners/databases and restore preferences. The automatic-capture script then clears only the synthetic fixture app's notifications, revokes access, posts a visible fixture alert, enables automatic mode with `selected=[]`, and grants access. It checks that the already-visible alert and a subsequent new alert are captured without opening MainActivity or selecting an app, and a repeated callback is collapsed. The storage tests do not clear the production capture database or delete its Keystore key.

The capture script leaves synthetic outbox data and notification access enabled **inside the dedicated AVD** so further lifecycle checks can continue. It must not be repurposed to install on a physical phone without reviewing its setup and obtaining the owner's permission for notification access.

Before a full rerun on this dedicated AVD, clear only the synthetic TinkerSpend test installation if it still holds a disposable session from the previous sync scenario. The normal instrumentation suite intentionally refuses a signed-in installation. Never clear app data on a personal phone as part of these scripts. Latest 0.2.0 evidence: `docs/evidence/codex-020-automatic-capture.md`.

## Interpretation

A built instrumentation APK is not an executed test. Record the runner output and capture counts in `docs/evidence/` only after actually running the suite. Emulator capture, even when successful, is synthetic evidence. Real UPI formats, OEM background behavior, physical microphone/camera behavior, production Google sign-in, deployed Free-tier limits and public APK installation remain separate acceptance checks.

The existing BlueStacks VM intermittently answers `getprop` but closes package-manager/install connections. Its configuration was inspected read-only; no global ADB setting, app data or existing VM configuration was changed.
