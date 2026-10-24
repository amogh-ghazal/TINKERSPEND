# Security and Cloudflare Free deployment readiness

This is an implementation/readiness review, not a claim of perfect security or a deployed audit. No Cloudflare account, billing plan, domain route, live Google/OpenAI configuration or public APK installation has been verified in this checkpoint.

## Controls verified locally

| Area | Control / evidence |
|---|---|
| Capture scope | One disclosed opt-in bound to the current account; no automatic scope reuse after an account change. Local source/sender/payment/OTP filters; personal messages and owner replies excluded. Android instrumentation and current-alert grant scenario pass. |
| Local storage | AES-GCM Android Keystore encryption for payload/session; blank persisted previews; owner-scoped diagnostics; Room persistence; backup/device-transfer exclusions. Emulator tests do not prove hardware-backed storage or OEM behavior. |
| Transport/bridge | Fixed HTTPS API host in normal/release builds, bounded native API path/method allowlist, no remote server URL for native JS, redirect following disabled. Emulator-only HTTP/debug hooks are excluded from release. |
| Authentication | Backend verifies Google issuer/audience/nonce/verified email and invite allowlist; revocable hashed sessions; browser HttpOnly/Secure/SameSite cookies and CSRF; Android bearer-only sessions. Tests reject production test-verifier use and native-token-as-cookie authentication. Live Google sign-in still pending. |
| Isolation/accounting | Queries scoped by account/device; integer paise; versioned edits; idempotent captures/status updates; opposite-direction events not collapsed; uncertain duplicates excluded from totals. API/browser/native tests cover these boundaries. |
| Resource limits | AI per-user/global reservation before provider calls; bounded payloads/batches/retries. Anonymous challenge creation is atomically capped at at most 1,000/day globally (configurable downward), without storing IPs. After the cap, new sign-ins receive 429/Retry-After; existing sessions still work. This bounds database writes, not all denial-of-service risk. |
| Web | Workers static `_headers` restrict scripts/connections/frames and disable framing, sniffing, location/payment APIs; GIS endpoints explicitly allowed. Browser tests verify headers and actual inline-script blocking. Real OAuth compatibility must still be checked. |
| Keys/logs | OpenAI credentials remain Worker secrets; no client-key embedding. Source-event backend records contain hashes/parsed evidence, not raw message bodies. Bounded APK content scans and targeted logs are recorded in the evidence. No logging or analytics provider was added. |
| Release | 0.2.0 release variant builds unsigned; manifest/content checks exclude debug receiver, fixture visibility, SMS-inbox permissions and debug host/key patterns. It is not a signed/distributable release. Original release key access/backup remains pending. |

## Free infrastructure

Use **Workers Free + static assets + D1 Free**, with the existing domain or a workers.dev address. Do not enable Workers Paid, R2, Queues, paid monitoring, paid authentication or automatic upgrades. OpenAI credits are the only authorized operating expense. Hosting still has quotas: Workers Free currently has 100,000 dynamic requests/day and 10 ms CPU/request; D1 Free has 5M reads/day, 100k writes/day, 5 GB/account and a 500 MB/database limit. Static asset files are limited to 25 MiB. Current APK sizes fit that file limit. These are platform limits, not measured live capacity for this app.

Primary references checked 25 October 2026: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [static headers](https://developers.cloudflare.com/workers/static-assets/headers/), [Google GIS CSP](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

## Before a public deployment

Complete the private inputs in `OWNER_ACTIONS.md`: verify the actual account remains Free; create project-scoped Worker/D1 resources and set real IDs; set the public Google client ID and exact HTTPS origins; keep OpenAI as a Worker secret; register actual APK signing fingerprints and invited accounts. `deploy.sh` derives the website's public client ID from the selected backend config. Keep the existing domain/DNS records intact. No secret values belong in chat, Git, APKs or form submissions.

`pnpm test:deploy-safety` runs 12 local guard cases without network/deployment. The deploy guard rejects invalid environment names, test authentication, placeholder databases, missing OAuth config, non-HTTPS/mixed origins and configured unapproved metered features. It cannot inspect or guarantee an account's billing tier. A live Free-tier deployment must still measure CPU/D1 usage and verify error/retry behavior.

Recover/back up the original signing key privately, sign and verify the release, then test developer installation and public download installation separately on a working phone. Android/Play Protect can restrict sideloaded notification listeners; HTTPS hosting does not bypass that policy. Respect the OS controls. Physical capture/redaction/battery behavior, live voice/receipt accuracy and full end-to-end deployment remain acceptance gates.
