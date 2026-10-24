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
