# TinkerSpend

Android expense tracker that captures payment notifications from apps you select, turns them into transactions, and reconciles them with manual, typed, voice and receipt entries so each payment is counted once. Monthly totals are in integer paise (INR), India time by default.

Status, evidence and what is still unverified: `docs/PROGRESS.md`, `docs/TEST_MATRIX.md`, `docs/evidence/`. Owner actions still needed: `docs/OWNER_ACTIONS.md`.

Owner: Amogh Suresh (@amogh-ghazal). Primary hackathon track: **Kill the Busywork**. [Submission preparation](SUBMISSION.md), [AI usage](AI_USAGE.md), [change log](CHANGELOG.md), [screenshots and evidence](docs/evidence/README.md), and [organizer-template provenance](docs/TEMPLATE_PROVENANCE.md). The existing repository history is preserved; it was not originally created through GitHub's template button.

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

Requires Node 22+ (22 recommended) and pnpm 11.25.0. The Codex Windows checkpoint passed under Node 24.22.1 / pnpm 11.25.0; Devin's historical handoff used pnpm 10. For Android: JDK 21 and Android SDK 36. The installer allows only the required esbuild/workerd native build scripts; release-age protection remains enabled in the local package manager. Development type packages and `ignore` are pinned to versions accepted by that policy.

```bash
pnpm run setup        # pnpm install --frozen-lockfile + toolchain checks
pnpm lint && pnpm typecheck
pnpm test             # domain/accounting
pnpm test:api         # Worker + D1 in local workerd (OpenAI mocked)
pnpm test:e2e         # browser, desktop + Pixel 7 viewport
```

On Windows, use these direct commands instead of the Bash setup wrapper:

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium --no-shell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:e2e
```

If bundled Chromium cannot launch on a particular machine, use an installed Chrome in an isolated test profile: `$env:TS_BROWSER_CHANNEL='chrome'; pnpm test:e2e`. This is how the Windows browser checks were verified. It does not attach to personal tabs.

The E2E command starts its own local Worker/D1 and static app, creates a fresh test-only database under ignored `.wrangler/`, and runs the demo interactions without keys. Do not deploy its insecure test identity verifier. Receipt browser tests mock extraction/draft responses; notification-to-receipt matching is tested separately in the API suite with local D1.

Supported English monetary words such as `lunch two hundred and fifty` are normalized deterministically, including Indian lakh/crore grammar and decimal digits. Invalid/approximate phrases remain unparsed; unsupported speech and real transcription accuracy still require evaluation. Drafts remain editable and require explicit Save.

## Android

```bash
pnpm android:debug    # debug APK (includes the synthetic fixture source, labelled; may use http://10.0.2.2)
pnpm android:test     # JVM unit tests
TS_RELEASE_KEYSTORE=/path/release.jks ANDROID_RELEASE_KEYSTORE_PASSWORD=... pnpm android:release
pnpm release:check path/to/app-release.apk   # signer, v2, no debuggable/cleartext, no secrets
```

Windows equivalent after setting `JAVA_HOME` (JDK 21) and `ANDROID_HOME` (SDK): `pnpm android:sync`, then `cd apps/client/android` and `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :fixture:assembleDebug`. Set `TS_DEBUG_KEYSTORE` to the privately backed-up shared debug key when testing Google sign-in; a default local debug signer will have a different OAuth fingerprint. Signing keys/passwords must not be committed.

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

Native diagnostics are scoped to the bound account. Notification text stays in the Keystore-encrypted payload; previews are decrypted on demand, rather than persisted as plaintext. Room schema version 2 includes a migration clearing legacy preview strings while retaining encrypted payloads. Current build/instrumentation status is recorded in progress; this is not a claim of physical-device verification.
