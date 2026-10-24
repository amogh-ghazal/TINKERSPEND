# Progress

_Status legend: **implemented** (code exists), **tested** (automated/manual evidence recorded), **failed**, **not tested**._

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
| Cloudflare Worker + D1 Free deploy & CPU measurement | **pending CLOUDFLARE_API_TOKEN / ACCOUNT_ID** | — |
| OpenAI model verification | **pending OPENAI_API_KEY** | — |
| Google sign-in | **pending GOOGLE_WEB_CLIENT_ID + OAuth clients** | — |

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

## Open failures
- Maven Central returned HTTP 429 to the build VM; Gradle uses Google's public Maven Central mirror via `~/.gradle/init.d/mirror.gradle` (VM-local, not in repo).
- Capacitor 8 Android requires JDK 21 (VM had 17).

## Next action
M7 done locally: signed release APK verified (docs/evidence/m7-release-apk.txt), README + deploy/migrate/release-check scripts. Remaining: production deploy + subdomain (Cloudflare credentials), real Google sign-in, real-phone capture, physical developer install, public APK install, voice/receipt evaluations (OPENAI_API_KEY), full demo (spec §22).
