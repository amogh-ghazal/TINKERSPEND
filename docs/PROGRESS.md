# Progress

_Status legend: **implemented** (code exists), **tested** (automated/manual evidence recorded), **failed**, **not tested**._

## Latest — 25 October 2026, dark interface refresh

The client now uses a charcoal and deep-green theme and presents the existing text, receipt and voice draft flows as a conversational assistant. Its dark chat draws on the provided WhatsApp references with a subdued, locally embedded doodle pattern, green user bubbles and gray assistant bubbles; it remains branded as TinkerSpend. It uses the same authenticated endpoints and review-before-save safeguards; suggested prompts fill the composer without making a request. Account settings expose the existing AI-processing opt-in with an OpenAI data/credit disclosure. AI use still depends on that setting, the quota and a private Worker key; text extraction falls back to deterministic parsing when AI is unavailable. Lint, full typecheck, web build, 68 domain tests and 48 API tests pass. Playwright could not launch bundled Chromium (`spawn UNKNOWN`); retries using system browsers stalled before returning results, so browser behavior is not verified in this checkpoint.

The earlier light-theme presentation refresh below is retained as historical work; this update supersedes its visual palette.

## Latest — 25 October 2026, production deployment

Production is live at `https://expenses.tinkercraft.in` on Cloudflare Workers Free + D1 Free. The dedicated custom domain is active, static assets return HTTPS 200 with the configured CSP, and `/api/v1/health` returned `{ "ok": true, "env": "production" }` with a production D1 response. The production Web OAuth client is configured in the Worker and deployed bundle. `pnpm test:deploy-safety` passed 12/12 and the production D1 migration check reported no pending migrations.

The production owner account is now in the backend invite allowlist; refresh the site and complete Google sign-in to verify the live session. OpenAI-backed voice, receipt and AI categorization remain disabled until an `OPENAI_API_KEY` is added as a Worker secret. The personal WhatsApp webhook/linking implementation and its production migration are deployed, but it remains inactive until it is connected to a Meta WhatsApp Business number and private Worker secrets. The public signed APK remains pending the original release key and a real Android device.

## Previous — 25 October 2026, automatic capture 0.2.0 / code 3

Implemented the owner's amended flow: one account-bound automatic opt-in + Android app-wide notification access, no per-source selection prompts; current visible/new notification collection; supported bank messaging alerts with personal/OTP/owner-reply filtering; explicit alert-time/reported-bank metadata; purpose/category clarification without blocking capture; safer duplicate and opposite-direction handling. The existing visual style is preserved for the owner's later redesign.

Verified: **68 domain, 48 local API, 20 browser, 8 Android instrumentation and 12 deployment-guard cases passed**; lint/typecheck and Android debug/test/fixture/unsigned-release builds passed. Actual automatic capture with `selected=[]`, current-alert import on access grant, process/access/reboot recovery and native WorkManager → local D1 passed. A native screenshot shows bank/time/purpose fields. New deterministic concurrent-edit coverage reproduced and now prevents losing edits from corrupting allocations/rules; category-edit provenance was corrected.

Security/readiness: native bearer-only sessions, production fake-auth rejection, bounded anonymous sign-in writes, web CSP/headers and explicit unsafe-deploy guards. `wrangler whoami` is not authenticated. Cloudflare Free deployment is prepared but not performed; actual billing/CPU limits, live OAuth/OpenAI, original release-key backup and physical/public APK checks remain pending. No paid services, new accounts, DNS changes, merge or final submission.

[Behavior](NOTIFICATION_CAPTURE.md) · [Security/hosting](SECURITY_AND_DEPLOYMENT.md) · [Actual evidence and limits](evidence/codex-020-automatic-capture.md). Earlier sections below are historical checkpoints.

## Codex continuation — 24 October 2026 (IST)

The owner explicitly transferred implementation to Codex. The historical Devin-only wording in the original spec is superseded for workflow; its product/privacy/free-tier constraints remain.

Independently reproduced on Windows: Node 24.22.1, pnpm 11.25.0, installed Chrome with desktop and Pixel 7 viewport:

- `pnpm install --frozen-lockfile`: pass; release-age policy retained, old-enough type/ignore pins, only esbuild/workerd native build scripts allowed.
- `pnpm test`: **65/65 pass** (including strict English monetary-word normalization, Indian scales, decimal digits, malformed phrases, quantities and identifier guards).
- `pnpm test:api`: **40/40 pass** against local Worker/D1 with mocked OpenAI, including transcript words and rejection of balance/invented amounts, plus real notification-ingest-to-receipt attachment/detachment with one ledger record and unchanged totals.
- `pnpm lint`, `pnpm typecheck`: pass. Removed the untyped test DB handle that hid invalid generic calls/null handling in the handoff.
- `$env:TS_BROWSER_CHANNEL='chrome'; pnpm test:e2e`: **16/16 pass**. Includes real client photo selection/JPEG normalization/IndexedDB and mocked receipt draft APIs for correction, total-only save, attach and Undo on desktop/mobile. No live OCR is claimed.
- `pnpm android:sync`: pass. Android 0.1.1/code 2 debug APK, synthetic fixture APK and Android test APK build successfully with JDK 21 / SDK 36 / verified Gradle 8.14.3. JVM scaffold smoke test: **1/1 pass**; it is not notification-capture coverage. APK v2 signature verifies; packaged web/config scan found zero OpenAI-key-pattern matches.

Changes: monetary words now have deterministic support with AI validation against parsed expense amounts rather than any digit substring; receipt drafts correctly say "From receipt"; ledger exposes Undo for attached receipts; cross-platform E2E server replaces the Bash-only harness. Browser screenshots are in `docs/evidence/screenshots/`, indexed by [evidence README](evidence/README.md).

Organizer-template records (`AGENTS.md`, `CHANGELOG.md`, `AI_USAGE.md`, `SUBMISSION.md`) were adapted into the existing repository. See `docs/TEMPLATE_PROVENANCE.md`: no template ancestry, event-date eligibility, final submission or deployment is claimed.

Still blocked/unverified: private signing key backup, live credentials/OAuth, Cloudflare Free deployment/CPU limits, real transcription and receipt evaluation, Oppo model/version/payment apps and real physical capture/public install. A laptop Android VM is available for synthetic checks; it is not physical UPI evidence.

### Native privacy follow-up

Source review found persisted plaintext previews and a global recent-events diagnostics query. These are now changed to owner-scoped queries, blank stored previews, on-demand decryption for the bound owner, and a Room v1→v2 cleanup migration that retains encrypted payloads. Both debug and test APKs build at version 0.1.1 / code 2. Initial BlueStacks ADB installation failed with `connect error for write: closed` ([earlier build evidence](evidence/codex-android-0.1.1.md)). A later separate SDK emulator now runs all six instrumentation tests successfully, including isolation/preview cleanup and the actual encrypted capture path; see below. Original release signing key still unavailable.

### Virtual continuation — 24 October 2026, 23:37 IST

The owner's Oppo does not turn on. The owner explicitly authorized continuing virtually while looking for another phone. Set up a separate free AOSP Android 16 / API 36 AVD with verified official runtime/image checksums and existing WHPX hardware acceleration. No existing BlueStacks settings or Windows features were changed.

- **6/6 Android instrumentation tests passed**: package, owner isolation/preview cleanup, fresh-IV authenticated Keystore encryption/tamper rejection, encrypted Room close/reopen and actual capture gates/filter/deduplication/persistence.
- **Synthetic native capture passed with MainActivity unopened**: payment captured, duplicate callback collapsed, OTP/promotion excluded.
- **Lifecycle passed**: process death, listener-access revoke/regrant, queued data surviving reboot and new capture without opening the app.
- **Native WorkManager → local Worker/D1 passed**: pending ₹700 observed, same transaction ID upgraded to successful, one ledger item, current-owner pending=0/failed=0. Local test identities only; no live Google/OpenAI.
- **Native dashboard rendered** after those checks; actual screenshot shows the ₹700 item awaiting review and excluded from spending. Nonfatal Capacitor startup safe-area CSS warning recorded; physical cutout/keyboard behavior remains pending.

Reproducible guarded PowerShell runners and limits: [virtual testing](VIRTUAL_TESTING.md). Raw logs/environment/actual screenshot: [virtual Android evidence](evidence/codex-virtual-android.md). This advances synthetic virtual verification; physical UPI capture, public install, original signing-key backup and all live-service/deployment checks remain pending.

## Current milestone: M0 — Foundation and feasibility

| Item | State | Evidence |
|---|---|---|
| Repo scaffold (pnpm monorepo, domain/contracts/api/client) | implemented | this branch |
| Domain money/date/accounting/parser unit tests | tested (fixtures, synthetic) | `pnpm test` |
| Android debug APK (listener, Room outbox, WorkManager, Capture/AuthBridge/Recorder plugins) | implemented, builds | `pnpm android:debug` |
| Emulator listener test with synthetic fixture app (UI closed) | tested on emulator only (synthetic) | docs/evidence/m0-emulator-listener-logcat.txt |
| Worker API + D1 schema, local integration tests | tested locally (11/11) | `pnpm test:api` |
| M1 dashboard UI (overview, ledger, review, add/edit/delete, refund, export, devices, sign-out, delete data) | implemented; local browser E2E 8/8 | `pnpm test:e2e` |
| Emulator lifecycle (kill, revoke, re-grant, reboot) | tested on emulator only (synthetic) | docs/evidence/m0-emulator-lifecycle.txt |
| Real-device capture on owner's payment app | **pending owner device** | — |
| Cloudflare Worker + D1 Free deploy | **deployed** at `https://expenses.tinkercraft.in`; HTTPS homepage/API-health smoke passed | 25 October 2026 |
| OpenAI model verification | **pending OPENAI_API_KEY** | — |
| Google sign-in | production Web OAuth client configured for `https://expenses.tinkercraft.in`; Android clients and live validation remain pending | — |

## M1–M6 status (2026-10-24)

| Milestone | State | Evidence | Pending (owner action) |
|---|---|---|---|
| M1 auth/ledger/dashboard | implemented; local API + browser E2E | `pnpm test:api`, `pnpm test:e2e` | real Google sign-in (GOOGLE_WEB_CLIENT_ID + OAuth clients) |
| M2 native outbox/sync/parsers | tested on emulator with synthetic app + local Worker | docs/evidence/m2-emulator-sync.txt | real payment app on owner phone |
| M3 categorization + AI review | tested with mocked OpenAI (API 20/20 at the time) | apps/api/test/ai.test.ts | OPENAI_API_KEY model check |
| M4 typed/voice drafts | tested: domain parser, API (mocked OpenAI), browser E2E (deterministic path) | statements/drafts tests, e2e/drafts.spec.ts | real transcription + voice evaluation; device mic |
| M5 receipts | API tested with mocked OpenAI; UI typecheck/build only | apps/api/test/receipts.test.ts | receipt evaluation (≥20), camera on device, UI E2E |
| M6 reliability/privacy | API tests (concurrency, credits, logout/deletion); local-data purge on sign-out | apps/api/test/m6.test.ts | measured D1/Worker limits on Cloudflare Free |

Totals at this commit: domain 45/45, API 38/38, browser E2E 10/10; lint/typecheck clean; source + web bundle secret scan clean.

## Review findings (updated by Codex, 2026-10-24)
- Spoken-number handling: fixed for the supported strict English monetary grammar; domain/API checks pass. Real voice accuracy remains unverified.
- Receipt UI click-through: six desktop/mobile cases pass with mocked receipt draft APIs; real camera/OCR still pending.
- Notification-origin receipt matching: local D1 integration now passes, including attach/undo and unchanged totals. Physical payment notifications still pending.
- Debug APK built without `TS_DEBUG_KEYSTORE` is signed by the VM default key, not the shared debug key registered for OAuth.
See docs/CODEX_HANDOFF.md.

## Open failures
- Maven Central returned HTTP 429 to the build VM; Gradle uses Google's public Maven Central mirror via `~/.gradle/init.d/mirror.gradle` (VM-local, not in repo).
- Capacitor 8 Android requires JDK 21 (VM had 17).

## Next action
Production is deployed. Remaining acceptance work: real Google sign-in, add the private OpenAI Worker secret and evaluate voice/receipt behavior, real-phone capture, physical developer install, public APK install, and the full demo (spec §22).
