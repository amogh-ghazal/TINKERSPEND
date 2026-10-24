# TinkerSpend

Android expense tracker that captures payment notifications from apps you select, turns them into transactions, and reconciles them with manual, typed, voice and receipt entries so each payment is counted once. Monthly totals are in integer paise (INR), India time by default.

Status, evidence and what is still unverified: `docs/PROGRESS.md`, `docs/TEST_MATRIX.md`, `docs/evidence/`. Owner actions still needed: `docs/OWNER_ACTIONS.md`.

## Layout

| Path | What |
|---|---|
| `packages/domain` | money, dates, accounting, notification/statement parsers, CSV safety (pure TS) |
| `packages/contracts` | zod request/response schemas shared by API and client |
| `apps/api` | Cloudflare Worker (Hono) + D1 migrations; the only place OpenAI is called |
| `apps/client` | React/Vite web app, also packaged by Capacitor for Android |
| `apps/client/android` | native Kotlin capture: `NotificationListenerService`, encrypted Room outbox, WorkManager sync, AuthBridge/Recorder plugins |
| `e2e` | Playwright browser tests (local Worker, test-only sign-in, no OpenAI) |
| `docs` | spec, decisions, costs, test matrix, evidence, evaluations |

## Setup

Requires Node 22, pnpm 10; for Android also JDK 21 and Android SDK 36.

```bash
pnpm run setup        # pnpm install --frozen-lockfile + toolchain checks
pnpm lint && pnpm typecheck
pnpm test             # domain/accounting
pnpm test:api         # Worker + D1 in local workerd (OpenAI mocked)
pnpm test:e2e         # browser, desktop + Pixel 7 viewport
```

## Android

```bash
pnpm android:debug    # debug APK (includes the synthetic fixture source, labelled; may use http://10.0.2.2)
pnpm android:test     # JVM unit tests
TS_RELEASE_KEYSTORE=/path/release.jks ANDROID_RELEASE_KEYSTORE_PASSWORD=... pnpm android:release
pnpm release:check path/to/app-release.apk   # signer, v2, no debuggable/cleartext, no secrets
```

The release keystore and password live only in owner-controlled secret storage (never in the repo). Release signer SHA-1: `81:48:00:D8:3A:E4:4B:A9:04:99:EE:2F:52:5D:7C:26:61:81:B8:D8`. Losing the keystore means existing installs cannot be updated; keep the backup.

## Deployment (Cloudflare Workers Free + D1 Free)

1. `wrangler d1 create tinkerspend-staging` / `tinkerspend-prod`; put the returned IDs into `apps/api/wrangler.toml` (the deploy refuses placeholder IDs).
2. Set `GOOGLE_WEB_CLIENT_ID` and `ALLOWED_ORIGINS` vars; set secrets: `wrangler secret put OPENAI_API_KEY [--env production]`.
3. `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... pnpm deploy:staging` (or `deploy:production`): safety check → web build → remote migrations → deploy.
4. Custom domain: only add `expenses.tinkercraft.in` if no DNS record exists for it; existing records and sites are left untouched.
5. Allowlist users (owner + testers) in the D1 `allowlist` table.

Never enable Workers Paid, R2, Queues, Logpush or any paid plan (`docs/COSTS.md`).

## Owner configuration

See `docs/OWNER_ACTIONS.md` for Google OAuth clients (web + Android release/debug SHA-1s), allowlisted emails, payment-app selection on the phone, and the APK install checklist.

## Recovery

- **Lost phone / switch account:** sign out offers to delete or keep pending captures; events queued under account A are never uploaded under account B. Revoke the old device in Settings.
- **Leaked OpenAI key:** rotate at OpenAI, then `wrangler secret put OPENAI_API_KEY`; no client artifact contains it.
- **Bad deploy:** `wrangler rollback [--env production]`; D1 migrations are additive.
- **D1 backup:** `wrangler d1 export tinkerspend-prod --remote --output backup.sql`; users can also export CSV.
- **Delete data:** Settings → delete account removes all server rows for the user; receipt photos exist only on the capturing device.

## Known limitations

Only notifications from selected, installed apps that post readable text are captured; historical notifications from before access was granted are unavailable; Android may delay background sync; receipt originals are local-only; public APK install may be blocked by Play Protect (a distribution limitation). Unverified items are listed in `docs/PROGRESS.md`.
