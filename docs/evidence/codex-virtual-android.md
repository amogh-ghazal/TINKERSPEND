# Codex virtual Android validation — 24 October 2026

The owner authorized continuing with a virtual device while looking for a working Android phone. These are synthetic emulator checks, not physical UPI evidence.

## Environment preparation

- Existing BlueStacks instance: read-only ADB probing still returned intermittent `closed` failures on package-manager/install commands. No existing VM settings or notification access were changed.
- Separate Android SDK emulator 37.2.12 / build 16428233 downloaded from Google's official repository. ZIP SHA-1 matches Google's HTTPS repository metadata: `488ed747e82de7e9bb5247becd1ac043c7e5e85d` (455,342,868 bytes).
- Emulator acceleration check: `WHPX(10.0.26200) is installed and usable`, exit 0. No Windows feature/BIOS setting or reboot was needed.
- Dedicated AVD name: `TinkerSpend_Codex_API36`. AOSP API 36 x86_64 system image, revision 2, official metadata SHA-1 `829c076e8ff448a336097ae25a355b495ba36e2c` (844,217,077 bytes). No Google Play services in this image.
- New instrumentation APK compiles successfully: six tests including capture gates/filter/deduplication through the real capturer, owner scoping, preview cleanup, Keystore fresh-IV/tamper checks, and Room close/reopen with a unique plaintext-marker scan.
- Local-only debug build uses `TS_API_BASE_URL_DEBUG=http://10.0.2.2:8787`. This build is for the emulator and is separate from the owner-facing HTTPS-configured development APK.
- Local test Worker/D1: fresh persistence, loopback-only listener, `APP_ENV=test`, disposable `e2e.test` identities. No real Google sign-in, live OpenAI call, deployment or paid service is part of this run.

## Execution status

System-image ZIP checksum matched the official metadata above. The dedicated emulator booted successfully as Android 16, API 36, on serial `emulator-5556` during this run. Unlike the existing BlueStacks connection, install, shell and instrumentation commands worked reliably.

| Check | Actual result | Evidence |
|---|---|---|
| Debug app, fixture and instrumentation install | all three succeeded | [native log](codex-virtual-native.txt) |
| Android instrumentation | **6/6 passed**, zero failures | [native log](codex-virtual-native.txt) |
| Real capturer gates and encrypted persistence | disabled/no-owner/unselected-source/OTP rejected; one encrypted row; repeated snapshot rejected | `CapturePipelineTest` in runner output |
| Keystore and Room | fresh encryption IVs, tamper rejection, payload readable after DB reopen; unique plaintext marker absent from test DB/WAL/SHM | `EncryptedOutboxTest` in runner output; emulated Keystore, no hardware-backed-key claim |
| NotificationListenerService, UI unopened | one synthetic payment queued; repeated callback collapsed; OTP and promotion excluded | [native log](codex-virtual-native.txt) |
| Process death | listener restarted by system and captured a new synthetic notification | [lifecycle log](codex-virtual-lifecycle.txt) |
| Access revoke/regrant | capture stopped while revoked, resumed after regrant | [lifecycle log](codex-virtual-lifecycle.txt) |
| Reboot | queued count retained, new notification captured; MainActivity had not been opened | [lifecycle log](codex-virtual-lifecycle.txt) |
| Native WorkManager → local Worker/D1 | observed a pending ₹700 transaction, then the same transaction ID became successful; exactly one ledger row, pending=0/failed=0 for the current owner | [sync log](codex-virtual-sync.txt) |
| Native UI | opened only after capture/lifecycle/sync checks; rendered October summary with one ₹700 review item excluded from spending totals | [actual emulator screenshot](screenshots/android-virtual-dashboard.png) |

The sync test uses a fresh synthetic identity for each run. Old-owner synthetic outbox rows remain tied to their previous owner; the current-owner diagnostics show zero pending after acknowledgement. AI categorization was not exercised: the captured payment correctly remains `needs_review`, rather than being invented as a confirmed expense.

Runner recovery: the first PowerShell runner attempt installed the APKs but stopped before instrumentation because adb's `-w` was parsed as an ambiguous PowerShell common parameter. Changed the adb wrapper to a plain argument-forwarding function, then ran the complete suite successfully. The final raw log is the successful run.

At native UI startup, Capacitor's `SystemBars` plugin emitted a nonfatal safe-area CSS injection warning while `document.documentElement` was not yet available. The dashboard rendered, no AndroidRuntime crash was observed in the targeted log, and the screenshot was visually inspected. Physical cutout/keyboard/edge-to-edge behavior remains unverified; no vendor dependency patch was applied.

Recorded through 23:37 IST on 24 October 2026. Physical UPI formats/background behavior, real Google sign-in, live transcription/receipt accuracy, Cloudflare deployment/limits, original release signing-key backup and public APK installation remain pending. No M0–M7 physical/deployment gate is marked complete by these emulator results.
