# External services and costs

| Service | Plan | Quota (from official docs, rechecked at setup) | Billing enabled? | Notes |
|---|---|---|---|---|
| Cloudflare Workers | Free required | 100,000 requests/day, 10 ms CPU/request | Account not inspected; Free must be verified before deployment | Static assets + API in one Worker |
| Cloudflare D1 | Free required | 5M rows read/day, 100k rows written/day, 500 MB/database, 5 GB/account | Account not inspected; Free required | staging + production DBs |
| Cloudflare DNS (tinkercraft.in) | existing | — | existing domain only | only `expenses` subdomain added if free |
| Google Cloud (OAuth client only) | no billing | Google sign-in basic scopes | No | Testing-mode consent |
| OpenAI API | owner's credits | per-token/minute pricing | owner's existing credits | only allowed operating expense |
| GitHub | existing repo | — | no new paid features | no paid CI |
| Maven Central mirror (Google) | free public | — | No | build-time dependency download only |

No R2, paid Workers, paid monitoring, SMS gateway, paid auth, paid CI, Play Console or Capacitor cloud services are used.

## OpenAI spend controls (only allowed operating expense)

| Operation | Model (wrangler var) | Per-user/day default | Notes |
|---|---|---|---|
| Category suggestion | `OPENAI_CATEGORY_MODEL` or `OPENAI_EXTRACT_MODEL` (`gpt-4.1-mini`, unverified until key) | 50 (`AI_USER_CLASSIFY_LIMIT`) | payee/amount/direction/status only |
| Typed statement | `OPENAI_EXTRACT_MODEL` | 50 (`AI_USER_TEXT_LIMIT`) | deterministic fallback when off/exhausted |
| Voice | `OPENAI_TRANSCRIBE_MODEL` (`gpt-4o-mini-transcribe`) + extract | 20 (`AI_USER_VOICE_LIMIT`) | ≤60 s, ≤3 MiB |
| Receipt | `OPENAI_EXTRACT_MODEL` (vision) | 10 (`AI_USER_RECEIPT_LIMIT`) | ≤750 KiB JPEG, one image |
| All | — | global 100/day (`AI_DAILY_GLOBAL_LIMIT`) | reserved before the provider call; timeouts → `outcome_unknown`, never auto-retried |

Measured per-operation cost: **pending OPENAI_API_KEY** (no estimates are claimed). Measured Worker CPU / D1 rows: **pending Cloudflare credentials**.

Automatic capture/filtering and deterministic merchant/user rules run without a model call. Anonymous sign-in challenges are capped at at most 1,000/day globally to bound database writes; this does not guarantee availability under abuse. Foreground overview/idle ledger refresh is once per minute and pauses while forms are edited. Local Android SDK emulation, Kotlin/TypeScript builds and all test tooling use free tools. Deployment safeguards have 12 local passing cases; account billing/live limits remain unverified.
