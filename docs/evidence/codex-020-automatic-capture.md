# 0.2.0 automatic capture checkpoint — 25 October 2026

The owner requested one app-wide notification setup, automatic current/new capture, reliable expense registration, optional purpose clarification, bank/time metadata and safe Free-tier hosting. This checkpoint implements those behaviors; visual redesign remains deferred.

## Verified checks

| Check | Actual result | Limits |
|---|---|---|
| Domain | **68/68 passed** | synthetic formats/English supported grammar |
| API/D1 | **48/48 passed** | local Miniflare D1; OpenAI mocked; no live Google |
| Browser | **20/20 passed** | isolated installed Chrome, desktop/Pixel 7 viewport; includes purpose + explicit separate-payment confirmation, correct totals, actual static CSP enforcement |
| Android instrumentation | **8/8 passed** | dedicated AOSP Android 16/API 36, emulated Keystore; no physical bank SMS/payment app |
| Global access/current alerts | **passed**: already-visible payment imported after access grant with `selected=[]`; new alert captured; repeated callback collapsed | debug synthetic fixture, no MainActivity |
| Process/access/reboot | **passed** in automatic mode | process killed/restarted, access revoked/regranted, outbox survived reboot and capture resumed without UI; no force-stop/OEM guarantee |
| Native → Worker/D1 | **passed**: pending ₹700 observed, same ID successful, one row, current-owner pending=0/failed=0; timestamp retained and HDFC Bank extracted from synthetic text | disposable fake identity, loopback-only server |
| Native UI | **visually inspected**: actual 0.2.0 review screen shows alert time, reported HDFC Bank and purpose question | [screenshot](screenshots/android-020-payment.png), synthetic data only |
| Deploy guards | **12/12 local cases passed** | no Cloudflare mutation; cannot verify account billing |
| Lint/typecheck | **passed** | includes deterministic concurrency test's typed D1 read barrier |
| Android builds | debug/test/fixture and unsigned release **passed**; JVM scaffold smoke 1/1 | JDK 21 / SDK 36 / Gradle 8.14.3; release signing/public install pending |
| Release static checks | no debug receiver/fixture visibility/SMS-inbox permission in manifest; backup false; no debug host/key-pattern hits in scanned DEX/web/config content | bounded scan, not a full audit; unsigned APK |

Raw native logs: [8-test suite](codex-020-native.txt), [global permission/current/new alerts](codex-020-permission.txt), [lifecycle](codex-020-lifecycle.txt), [native/local sync](codex-020-sync.txt).

## Correctness and security findings fixed

- Recognized merchant mappings no longer get unnecessarily sent to review solely because a one-word business name looks like a person.
- App/bank alerts with a shared UPI reference and amount dedupe without discarding opposite-direction legs or user explanations. Reference-free similar alerts remain possible duplicates for explicit review. Conflicting bank evidence is retained as a warning/unknown bank, including after later repeated alerts.
- A deterministic concurrent-edit test exposed an earlier bug: ten requests read the same version, only one edit was accepted, but a rejected edit could still overwrite allocations/rules. The failing test produced allocations of 10,900 paise against a 10,000-paise transaction. A fresh edit marker now gates every side effect in the versioned D1 batch; the regression and full API suite pass. Category edit provenance is saved before serialization as well.
- Fake identity verification stays disabled in production. Native sessions cannot be used as browser cookies. Anonymous sign-in challenge writes are globally bounded. Static web CSP and feature/framing headers are enforced in browser tests. Deploy guards reject unsafe/test/missing configuration and derive matching website OAuth client config.

During one heavily concurrent build/emulator/API run, an existing five-second M6 test timed out. It passed on rerun after reducing host load without raising its timeout. API file workers are now capped at two; the expanded final suite passes. The first grouped-notification test fixture used the wrong public Android constructor signature; it was corrected before the eight-test run. Neither failure is represented as a successful check.

## Remaining gates

`wrangler whoami` reports **not authenticated**. No Cloudflare account/billing plan, deployed CPU/D1 usage, live Google/OpenAI behavior or DNS route was verified/changed. No new paid service or temporary preview account was created. Normal HTTPS development artifacts and local-test APKs are exported separately; the release variant is unsigned until the original signing key is privately available and backed up.

A working phone is still required for real UPI/bank/messaging formats, notification redaction, battery/background behavior, camera/microphone and developer/public installation outcomes. Cloudflare hosting cannot bypass Android/Play Protect restrictions. Native startup's previously recorded nonfatal Capacitor safe-area warning and physical cutout/keyboard behavior remain follow-up checks. This checkpoint does not mark those acceptance gates complete or claim perfect security.
