# External services and costs

| Service | Plan | Quota (from official docs, rechecked at setup) | Billing enabled? | Notes |
|---|---|---|---|---|
| Cloudflare Workers | Free | 100,000 requests/day, 10 ms CPU/request | No (must remain Free) | Static assets + API in one Worker |
| Cloudflare D1 | Free | 5M rows read/day, 100k rows written/day, 500 MB/database, 5 GB/account | No | staging + production DBs |
| Cloudflare DNS (tinkercraft.in) | existing | — | existing domain only | only `expenses` subdomain added if free |
| Google Cloud (OAuth client only) | no billing | Google sign-in basic scopes | No | Testing-mode consent |
| OpenAI API | owner's credits | per-token/minute pricing | owner's existing credits | only allowed operating expense |
| GitHub | existing private repo | — | no new paid features | no paid CI |
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
