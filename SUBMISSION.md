# TinkerSpend submission preparation

- **Project:** TinkerSpend
- **Track:** Kill the Busywork (primary); also makes spending patterns visible.
- **Description:** One expense ledger for selected Android payment notifications, receipt photos, typed notes and recorded voice, with reviewable categorization and monthly totals in integer paise.
- **Repository:** https://github.com/amogh-ghazal/TINKERSPEND
- **Working branch / PR:** `devin/1792854130-m0-foundation`, https://github.com/amogh-ghazal/TINKERSPEND/pull/1
- **Final submitted implementation SHA:** Not submitted; do not treat an intermediate checkpoint as final.
- **Owner:** Amogh Suresh (@amogh-ghazal). Any additional participants must be confirmed by the owner.
- **Public live demo:** Not deployed. `expenses.tinkercraft.in` remains proposed.

## Run and demonstrate

See [README](README.md) for reproducible commands and prerequisites. `pnpm test:e2e` launches a local Worker/D1 test server and browser tests; it needs no Google, OpenAI or Cloudflare credentials. Its authentication is explicitly test-only and must never be deployed. Browser receipt extraction is mocked and marked as such; API receipt reconciliation is separately tested against local D1.

Demo sequence: monthly overview → ledger/refunds → typed expense drafts → upload a synthetic receipt → inspect/correct lines → explicitly save or attach to an existing payment → inspect local photo indicator → undo an attachment. Current screenshots and their test provenance are indexed in `docs/evidence/README.md`.

Android: `pnpm android:sync`, then run Gradle with JDK 21 and Android SDK 36. A synthetic notification app is provided under `apps/client/android/fixture`. Emulator capture does not establish that real payment apps or a physical phone work.

## Status and disclosure

Read [progress](docs/PROGRESS.md), [test matrix](docs/TEST_MATRIX.md), [AI usage](AI_USAGE.md), [change log](CHANGELOG.md), [costs](docs/COSTS.md), [owner actions](docs/OWNER_ACTIONS.md) and [template provenance](docs/TEMPLATE_PROVENANCE.md).

Real Google sign-in, deployed Cloudflare Free measurements, live transcription/receipt accuracy, payment-app capture on a physical phone and public/developer APK installation outcomes remain unverified. Signing key backup still requires owner action. Do not present synthetic fixtures or mock extraction as live UPI integration.

Libraries/services: React, Vite, TypeScript, Capacitor, Kotlin/AndroidX Room/WorkManager, Hono, jose, zod, Cloudflare Workers/D1, OpenAI, Vitest and Playwright. Versions are pinned in package manifests/Gradle and the lockfile; licenses remain with their respective dependencies. No external personal-finance dataset is imported.

## Owner review checklist

- [ ] Confirm participants, current event rules and any literal template-creation requirement.
- [ ] Review implementation, screenshots, known limitations and demo steps.
- [ ] Complete real-device/live-service checks before claiming them as working.
- [ ] Securely preserve signing keys and password.
- [ ] Record final implementation SHA and actual demo instructions when ready.
- [ ] Review and submit the Google Form personally. Codex has not submitted it.
