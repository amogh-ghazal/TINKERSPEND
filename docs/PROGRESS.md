# Progress

_Status legend: **implemented** (code exists), **tested** (automated/manual evidence recorded), **failed**, **not tested**._

## Current milestone: M0 — Foundation and feasibility

| Item | State | Evidence |
|---|---|---|
| Repo scaffold (pnpm monorepo, domain/contracts/api/client) | implemented | this branch |
| Domain money/date/accounting/parser unit tests | tested (fixtures, synthetic) | `pnpm test` |
| Android Capacitor project + Kotlin listener/outbox | implemented, building | — |
| Emulator listener test with synthetic fixture app | not tested yet | — |
| Real-device capture on owner's payment app | **pending owner device** | — |
| Cloudflare Worker + D1 Free deploy & CPU measurement | **pending CLOUDFLARE_API_TOKEN / ACCOUNT_ID** | — |
| OpenAI model verification | **pending OPENAI_API_KEY** | — |
| Google sign-in | **pending GOOGLE_WEB_CLIENT_ID + OAuth clients** | — |

## Open failures
- Maven Central returned HTTP 429 to the build VM; Gradle uses Google's public Maven Central mirror via `~/.gradle/init.d/mirror.gradle` (VM-local, not in repo).
- Capacitor 8 Android requires JDK 21 (VM had 17).

## Next action
Build debug APK, run listener on emulator with the synthetic fixture app.
