# Change log

## 2026-10-25 — Production account access

- Changed: added the owner's configured Google account to the production D1 invite allowlist.
- Validation: the remote D1 insert succeeded against `tinkerspend-prod`; the live site continues to serve over HTTPS.
- Limits: this only authorizes the configured owner account. Android OAuth configuration, the private OpenAI Worker secret, release signing and physical-device validation remain pending.

## 2026-10-25T02:02:02.1655509+05:30 — Production deployment

- Changed: configured the production Web OAuth client and deployed the Worker plus static site to `https://expenses.tinkercraft.in` on Cloudflare Workers Free + D1 Free.
- Validation: deploy guard 12/12, production D1 migrations current, HTTPS homepage returned 200 with the expected CSP and `/api/v1/health` returned `ok` with production D1.
- Limits: live Google sign-in, the private OpenAI Worker secret, Android OAuth configuration, release signing and physical-device testing remain pending. No paid Cloudflare service was enabled.

## 2026-10-25T00:40:10.0305433+05:30 — Automatic capture and register reliability

- Changed: replaced per-source onboarding with disclosed account-bound automatic capture; current-visible import on connect/resume; supported bank message notification filtering including grouped sender/owner-reply boundaries. No SMS inbox permission. Android version 0.2.0 / code 3.
- Changed: persisted/displayed/exported alert time and reported bank; preserved bank conflicts/unknown values; added in-app purpose/category/remember controls and idle foreground refresh; refined own-account credit/reference/direction handling and possible-duplicate review.
- Fixed: a deterministic simultaneous-edit test exposed rejected updates changing allocations/rules. Every side effect now shares a successful-edit marker; user category edits are correctly recorded. Conflicting/repeated alerts preserve user explanations and no longer restore a bank after a known conflict.
- Security: native sessions require bearer auth; fake verifier cannot run in production; anonymous challenge writes are bounded; static CSP/headers; stricter Free-tier/config deployment guards and matched web OAuth config. Fixtures/debug receiver visibility remain debug-only.
- Validation: 68 domain, 48 API (local D1/mocked OpenAI), 20 browser, 8 native instrumentation, 12 deployment guard cases; lint/typecheck pass; global/current/new/lifecycle/native-sync checks pass; debug/test/fixture/unsigned-release builds and bounded release static checks pass. See `docs/evidence/codex-020-automatic-capture.md` for actual evidence and recovered failures.
- Limits: Cloudflare CLI is unauthenticated; account billing/live deployment, real Google/OpenAI, original release signing key and phone/public-install checks remain pending. Visual redesign deferred; no paid service, DNS change, merge or submission.

## 2026-10-24T23:40:20.4780257+05:30 — Virtual Android continuation

- Changed: added six native instrumentation cases in total (three new capture/encrypted-storage tests alongside existing isolation/migration/package tests), guarded Windows emulator/capture/lifecycle/local-sync runners and virtual test instructions/evidence.
- Why: the owner's available phone does not start; the owner authorized virtual development while finding another Android device. The existing BlueStacks connection could not install reliably, so created a separate AOSP API 36 test AVD using official checksum-verified downloads and existing WHPX acceleration.
- Validation: all three test APKs installed; **6/6 instrumentation passed**; synthetic capture/duplicate/OTP/promotion checks passed without opening MainActivity; native process restart, access revoke/regrant and reboot checks passed. Native WorkManager delivered notifications to local Worker/D1: observed pending ₹700, then the same ID became successful, exactly one transaction and zero pending/failed for the current owner. Native dashboard screenshot visually inspected.
- Runner fix during validation: adb `-w` initially collided with PowerShell common-parameter parsing; changed the wrapper to a plain function and completed the suite. No app/domain/API production behavior was changed in this checkpoint.
- Limits: synthetic/local-only, no live Google/OpenAI/deployment or physical UPI/public installation. Recorded a nonfatal Capacitor startup safe-area CSS warning; device cutout/keyboard behavior remains pending. Original signing-key backup remains an owner action.

## 2026-10-24T21:59:59+05:30 — Native diagnostics privacy

- Changed: account-scoped recent-event/pending/failed diagnostics; removed plaintext preview writes from capture and decrypt previews only on demand for the bound owner. Room v1→v2 migration clears legacy preview strings without deleting encrypted payloads. Added Android instrumentation coverage for isolation and migration, and corrected the scaffold's stale package assertion.
- Changed: next Android build version defaults to 0.1.1 / code 2; no release signing material was generated or replaced.
- Why: native review found financial preview text persisted outside encrypted payloads and a global recent-events query that could expose another account's diagnostics after a switch.
- Validation: native call sites/diff reviewed; 0.1.1/code 2 debug, fixture and Android test APK builds pass; JVM scaffold smoke 1/1; APK v2 signature verifies and packaged web/config OpenAI-key-pattern scan has zero matches. Isolation/migration instrumentation compiles but could not run: VM ADB streaming install reports `closed`, reconnect/non-streaming recovery did not succeed. Earlier TypeScript/browser results remain separately recorded below.
- Toolchain recovery: Android SDK 36 installed; downloaded Gradle 8.14.3 binary distribution matches the official SHA-256 `bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531`. Initial wrapper/all-distribution download attempts timed out. Manual verified distribution used for the local build; no checksum/TLS validation bypassed.
- Limitations: no physical-phone capture, live credentials/OAuth/deployment or original release-key access yet. Do not treat code review or an APK build as physical-device evidence.

Build/packaging verification recorded at 2026-10-24T22:08:44+05:30; details and checksums: `docs/evidence/codex-android-0.1.1.md`.

## 2026-10-24T21:47:23+05:30 — Codex continuation and submission records

- Changed: strict English monetary-word normalization and independent AI amount validation in domain/API; tests now cover spoken words and prevent balance/invented amounts from being accepted.
- Changed: notification-origin receipt reconciliation integration coverage, receipt browser correction/total-only/attachment/Undo scenarios; added missing Undo control and corrected receipt source label.
- Changed: cross-platform local E2E server, optional installed-Chrome test channel, typed test DB handle and null-safe test assertions; package manager pinned to tested pnpm 11.25.0 with narrowly allowed esbuild/workerd build scripts. Pinned older `workers-types` and `ignore` releases accepted by existing local supply-chain age protection; refreshed lockfile.
- Changed: adapted organizer-linked documentation structure (AGENTS, AI_USAGE, SUBMISSION, template provenance) while preserving the original repository history. Added actual browser screenshots with explicit synthetic/mock provenance and Windows run instructions.
- Why: continue the owner's saved Devin project in Codex, close known local correctness/coverage gaps and make the hackathon repository reviewable.
- Validation: frozen install passed; domain 65/65; local API 40/40 (mocked OpenAI); browser 16/16 (installed Chrome desktop/mobile); lint/typecheck passed; web/native web build and Capacitor sync passed. Screenshots visually inspected. New browser correction tests initially asserted before the asynchronous commit arrived; fixed with a retrying assertion. Bundled Chromium could not launch on this laptop, so the documented installed-Chrome test option was used.
- Limitations: new Android package/JVM check initially blocked by Gradle download timeout, recovery ongoing; live services and physical phone not verified. Original signing keys still require private backup. No deployment, paid services, final submission, history rewrite or merge performed.

## Earlier Devin history

The original development log is preserved in Git and `docs/PROGRESS.md`, `docs/TEST_MATRIX.md`, `docs/CODEX_HANDOFF.md`. Checkpoint `cb9b6871ac8b80201416089ea1050c1d7150019a` was pushed by Devin on 24 October 2026 before Codex continued. This file does not invent retrospective timestamps or claim that the original repository was created from the organizer template.
