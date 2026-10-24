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
| Real-device capture on owner's payment app | **pending owner device** | — |
| Cloudflare Worker + D1 Free deploy & CPU measurement | **pending CLOUDFLARE_API_TOKEN / ACCOUNT_ID** | — |
| OpenAI model verification | **pending OPENAI_API_KEY** | — |
| Google sign-in | **pending GOOGLE_WEB_CLIENT_ID + OAuth clients** | — |

## Open failures
- Maven Central returned HTTP 429 to the build VM; Gradle uses Google's public Maven Central mirror via `~/.gradle/init.d/mirror.gradle` (VM-local, not in repo).
- Capacitor 8 Android requires JDK 21 (VM had 17).

## Next action
Build debug APK, run listener on emulator with the synthetic fixture app.
