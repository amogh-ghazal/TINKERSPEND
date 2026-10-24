# Codex handoff — TinkerSpend (checkpoint 2026-10-24)

Branch `devin/1792854130-m0-foundation`, PR https://github.com/amogh-ghazal/TINKERSPEND/pull/1 (open, not merged). Spec: `docs/EXECUTION_SPEC.md` (authoritative). Status: `docs/PROGRESS.md`, `docs/TEST_MATRIX.md`, decisions `docs/DECISIONS.md`, costs `docs/COSTS.md`, owner actions `docs/OWNER_ACTIONS.md`.

**Nothing is deployed. No real device, real payment app, real Google sign-in, Cloudflare account or OpenAI key has been used yet.**

## Architecture

- `packages/domain` — pure TS: integer-paise money, Asia/Kolkata dates, accounting (gross/refunds/net/review/pending), refunds, notification parsers, typed-statement parser (`statements.ts`), receipt reconciliation, largest-remainder allocation, CSV formula-injection safety.
- `packages/contracts` — zod schemas shared by API/client.
- `apps/api` — Cloudflare Worker (Hono) + D1 (`migrations/0001..0003`). Routes under `/api/v1`: auth (Google ID token + allowlist, sessions), ledger/refunds/summary/export, `notifications/batch` ingest, `ai/classify`, `operations/:id`, drafts (`text`, `voice`, `receipt`, `:id/commit`, `:id/matches`, `:id/attach`, `:id/detach`). Only place OpenAI is called (Responses API, `store:false`); per-user + global daily quotas reserved before calls; timeouts → `outcome_unknown`, never auto-retried. Serves `apps/client/dist` as static assets.
- `apps/client` — React 19 + Vite web app; Capacitor 8 wraps it for Android. Screens: Overview, Ledger, Review, QuickAdd (typed/voice/receipt), Settings, Capture (native only).
- `apps/client/android` — native Kotlin, independent of the WebView: `PaymentNotificationListener` → Keystore-encrypted Room outbox (`OutboxDb`) → `SyncWorker` (WorkManager, ≤5 events/batch, owner-bound, auth-paused on 401) ; plugins `Capture`, `AuthBridge` (session token never reaches JS), `Recorder` (AAC ≤60 s/3 MiB). `fixture/` = synthetic notification poster (debug testing only).

## Toolchain (verified on the VM)

Node 22.23.4 (`.nvmrc`), pnpm 10.18.0, JDK 21 (Capacitor 8 needs it), Android SDK platform/compile/target 36, AGP 8.13.0, Gradle wrapper 8.14.3, Kotlin 2.3.21, KSP 2.3.12, Room 2.8.4, WorkManager 2.11.2, Capacitor 8.5.3, Wrangler 4.152.0, Hono 4.13.13, jose 6.2.13, zod 4.6.7, Vitest 4.1.12, Playwright 1.64.1. Emulator used: AVD `ts36`, Android 16/API 36 Google APIs x86_64.

VM env setup (not secret):
```bash
export ANDROID_HOME=$HOME/tools/android-sdk ANDROID_SDK_ROOT=$HOME/tools/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$HOME/tools/node/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH
# only if Maven Central rate-limits you (HTTP 429):
mkdir -p ~/.gradle/init.d && cp scripts/gradle/mirror.init.gradle ~/.gradle/init.d/
```

## Commands

```bash
pnpm run setup                 # frozen-lockfile install + toolchain checks
pnpm lint && pnpm typecheck
pnpm test                      # domain
pnpm test:api                  # Worker + D1 in local workerd, OpenAI mocked via fetch spy
pnpm test:e2e                  # Playwright; scripts/e2e-server.sh starts local Worker with test-only auth
pnpm db:migrate:local
pnpm android:debug             # cap sync + assembleDebug (generated: android/app/src/main/assets, capacitor-cordova-android-plugins, res/xml/config.xml)
pnpm android:test              # JVM unit tests
TS_RELEASE_KEYSTORE=<path> ANDROID_RELEASE_KEYSTORE_PASSWORD=<from owner store> pnpm android:release
pnpm release:check <apk>       # signer SHA-1, v2, no debuggable/cleartext, backup off, secret/debug-host scan
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... pnpm deploy:staging   # NEVER RUN YET; needs real D1 IDs in wrangler.toml first
pnpm deploy:production         # same; custom domain only if expenses.tinkercraft.in has no DNS record
```

## Environment variable / secret NAMES (values never in repo)

Worker vars (`wrangler.toml`): `APP_ENV`, `ALLOWED_ORIGINS`, `GOOGLE_WEB_CLIENT_ID`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_EXTRACT_MODEL`, `OPENAI_CATEGORY_MODEL`, `AI_DAILY_GLOBAL_LIMIT`, `AI_USER_CLASSIFY_LIMIT`, `AI_USER_TEXT_LIMIT`, `AI_USER_VOICE_LIMIT`, `AI_USER_RECEIPT_LIMIT`, `SESSION_DAYS`. Worker secret: `OPENAI_API_KEY`. Test-only: `TEST_ID_TOKEN_VERIFIER` (refused by `check-deploy-safety.sh`).
Deploy: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Android build: `TS_RELEASE_KEYSTORE`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `TS_DEBUG_KEYSTORE`, `TS_API_BASE_URL`, `TS_API_BASE_URL_DEBUG`, `TS_RELEASE_SHA1` (release-check override). Devin secret-store names offered for keystore backup: `TINKERSPEND_RELEASE_KEYSTORE_B64`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `TINKERSPEND_DEBUG_KEYSTORE_B64`.

## Test results at this checkpoint

Mocked / local (no real external services):
- Domain (Vitest): 45/45.
- API (local workerd + D1, OpenAI mocked): 38/38 — auth/isolation, ledger/refunds/summary, ingest dedupe/transitions, AI quotas/concurrency/outcome_unknown, text/voice drafts, receipts (split, arithmetic, mismatch, match/attach/detach, user-scoped duplicate hash, injection), M6 concurrency/credits/logout/deletion.
- Browser E2E (Playwright, desktop + Pixel 7 viewport, test-only sign-in, no OpenAI): 10/10. Covers dashboard/manual ledger/refund/export and typed drafts only.
- Lint + typecheck clean; source, web bundle and release APK secret scans clean.

Emulator (synthetic fixture app, NOT a real payment app): listener with UI closed, kill/revoke/re-grant/reboot, outbox → local Worker sync, pending→success one txn, account-switch isolation (`docs/evidence/m0-*`, `m2-emulator-sync.txt`). Release APK: signed/hardened, installs and listener connects on emulator (`m7-release-apk.txt`).

Real-device / live — ALL PENDING: real payment-app capture, physical install (developer and public/Play Protect), real Google sign-in, Cloudflare Free deploy + CPU/D1 measurements, OpenAI model verification, voice evaluation, receipt evaluation (≥20), production domain, spec §22 demo.

## Known defects / findings to investigate

1. **Spoken-number amounts may be rejected by `amountInSource`** (`apps/api/src/drafts.ts`): it only matches digit sequences (plus `Nk`) in the transcript/text. If the transcript says "two hundred fifty" and the model returns `250`, the amount is dropped as `amount_not_in_source` and the user must type it. Safe (no guess) but hurts voice UX; consider a bounded words→number normalizer with tests, keeping the no-invention guarantee.
2. **Receipt UI click-through untested**: QuickAdd receipt flow (camera/gallery input, normalization, IndexedDB original, line editing, Save total only, Attach, Undo) only typechecks/builds; no Playwright test (needs a mocked-OpenAI e2e harness, e.g. an `OPENAI_BASE_URL`-style override for test env only).
3. **Notification-origin receipt matching untested**: receipt match/attach tests use a manually created transaction; add a test where the txn comes from `notifications/batch` (source `notification`) and assert one ledger expense after attach.
4. **Debug APK signer mismatch**: `assembleDebug` without `TS_DEBUG_KEYSTORE` signs with the VM's `~/.android/debug.keystore` (SHA-1 90:27:FE:…:CD:5B), not the shared TinkerSpend debug keystore (43:31:6C:…:9A:22) registered for the Android debug OAuth client. Set `TS_DEBUG_KEYSTORE` to the shared debug keystore for sign-in testing.
5. Model names `gpt-4.1-mini` / `gpt-4o-mini-transcribe` are unverified placeholders until an OpenAI key is available.
6. `wrangler.toml` still has placeholder D1 IDs (deploy refuses them by design) and `routes = []` for production.
7. Native WorkManager event retry uses exponential backoff without an attempt cap (data must not be dropped); enrichment jobs are capped at 5.

## Remaining owner actions (details in docs/OWNER_ACTIONS.md)

`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`; Google OAuth (web client → `GOOGLE_WEB_CLIENT_ID`, Android clients for release/debug SHA-1); `OPENAI_API_KEY`; allowlisted emails; phone model/Android version and selected payment apps; APK install or USB debugging; keystore backup confirmation (below).

## Signing keys

Release + debug keystores and release password were generated on the Devin VM in `~/secure/` (outside the repo, `*.jks` gitignored). As of this checkpoint the owner's saved-secret store showed **no** keystore secrets; save prompts were re-issued in the Devin session. Devin secrets are usable by Devin sessions but are not a downloadable file for Codex: the owner should also keep an offline copy in their own password manager/vault. If the release keystore is lost, installed release builds can't be updated (new key = reinstall).

## Files that exist only on the Devin VM (not in git)

| Path | What | Action |
|---|---|---|
| `~/secure/tinkerspend-release.jks`, `~/secure/release.pw`, `~/secure/tinkerspend-debug.jks` | signing material | owner secure backup (see above); never commit |
| `~/.android/debug.keystore` | VM default debug key (signed current debug APK) | disposable |
| `~/.gradle/init.d/mirror.gradle` | Maven mirror | copy now in repo: `scripts/gradle/mirror.init.gradle` |
| `~/.ts_env` | PATH/JAVA_HOME exports | reproduced above |
| `~/tools/node`, `~/tools/android-sdk`, `~/.android/avd/ts36*` | toolchain + emulator | reinstall from versions above |
| `release-artifacts/` (gitignored) | APKs, SHA256SUMS, SIGNERS, evidence zip | delivered as session attachments |
| `node_modules`, `build/`, `dist/`, `dist-native/`, `.wrangler/`, cap-sync generated android assets | generated | regenerate |
