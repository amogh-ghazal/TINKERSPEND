# TinkerSpend

**One place to capture, review and understand everyday spending.** TinkerSpend is an Android-first expense tracker with a web companion. It can collect supported payment alerts, turn typed or spoken notes and receipt photos into editable drafts, and keep uncertain items in review.

**Live demo:** [expenses.tinkercraft.in](https://expenses.tinkercraft.in/) · **Status and known limits:** [project progress](docs/PROGRESS.md) · **Submission notes:** [SUBMISSION.md](SUBMISSION.md)

> The WhatsApp-style screen and SuperMoney payment/share flow are a TinkerSpend presentation prototype using synthetic sample data. They do not connect to WhatsApp or SuperMoney, send messages, or initiate payments. OpenAI processing is optional and is unavailable in production until the owner configures a private Worker secret.

## Demo in about a minute

1. Open the [live demo](https://expenses.tinkercraft.in/) and choose the invited Google account. Production access is restricted to the server-side email allowlist.
2. Start on **Overview**, then open **SuperMoney** to see a clearly labelled sample ₹3,500 payment-success screen.
3. Tap **Share** and choose **WhatsApp** to view the in-app share-sheet transition and the WhatsApp-inspired chat. The share creates an editable transaction draft; it is not a real OS share or WhatsApp delivery.
4. Reply to the assistant’s purpose question within 30 seconds (for example, “Dinner with friends”). The reply is associated with that exact draft. Review it in **Review** before saving.
5. Open **Account** to show privacy and AI-processing controls. **Overview** presents saved transaction totals; the SuperMoney sample is not counted as real spending until the user reviews and saves it.

For a stable presentation when sign-in or network access is unavailable, use the labelled screenshots below. They were produced from the local browser test with synthetic fixtures and mocked API responses; they are not screenshots of a real bank, real WhatsApp, live OCR, or production OpenAI processing.

## Demo screenshots

| Step | Screenshot |
|---|---|
| Sample payment success | [SuperMoney payment](docs/evidence/screenshots/supermoney-payment-demo.png) |
| Choose a share destination | [Share sheet](docs/evidence/screenshots/supermoney-share-sheet.png) |
| Shared receipt and purpose follow-up | [WhatsApp-style chat](docs/evidence/screenshots/supermoney-shared-to-chat.png) |
| Android capture evidence | [Synthetic Android payment capture](docs/evidence/screenshots/android-020-payment.png) |

More browser and emulator evidence, with provenance and limitations, is indexed in [docs/evidence/README.md](docs/evidence/README.md).

## What it does

- Captures currently visible and subsequent supported payment notifications after a single, disclosed Android notification-access setup. There is no SMS inbox permission and no per-app permission picker. Capture filters run locally; uncertain debits, refunds and possible duplicates go to review. See [notification capture behavior](docs/NOTIFICATION_CAPTURE.md).
- Supports manual entries, typed descriptions, receipt photos, voice notes and an Android encrypted offline outbox. AI-derived fields remain editable; saving a draft requires the user’s explicit action.
- Tracks INR using integer paise, handles expenses/refunds and monthly totals, and supports CSV export.
- Offers an invited-account web app and a Capacitor Android client with native Kotlin notification capture, encrypted Room storage, and WorkManager sync.
- Includes the **WhatsApp** and **SuperMoney** demo sections shown in the supplied presentation flow. These are in-app simulations, not integrations with either third-party service.

## OpenAI processing and credits

OpenAI calls are made **only by the Cloudflare Worker**, never by the browser or APK. The key is read from the Worker’s `OPENAI_API_KEY` secret; it must not be put in source code, a Vite/client variable, screenshots, GitHub, or chat. The account’s AI-processing opt-in and server quota still apply. Without a configured key, deterministic text parsing can still handle supported simple entries; AI-dependent receipt extraction and voice transcription report that they are not configured.

Automated checks below stub OpenAI and do not consume API credits. No live OpenAI request is included in this test suite or in the SuperMoney demo flow. To configure a **new, private** production key after creating it in the OpenAI dashboard, run this from the repository root and enter the value only at Wrangler’s hidden prompt:

```powershell
pnpm --filter @tinkerspend/api exec wrangler secret put OPENAI_API_KEY --env production
```

For local Worker development, use the ignored `apps/api/.dev.vars` file and keep it out of Git. Never paste a key in chat. If a key has been shared in a message, revoke it and create a replacement before use. See [security and deployment](docs/SECURITY_AND_DEPLOYMENT.md) and [cost limits](docs/COSTS.md).

## Run locally

Requirements: Node.js 22 or newer (22 recommended), pnpm 11.25.0, JDK 21 and Android SDK 36 for Android builds.

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
$env:TS_BROWSER_CHANNEL = 'chrome'
pnpm test:e2e
```

`test:api` uses local workerd/D1 and mocked OpenAI responses. `test:e2e` starts an isolated local Worker/database and uses test-only sign-in; it does not call OpenAI or production. Do not deploy the insecure test identity verifier. See [virtual Android testing](docs/VIRTUAL_TESTING.md) for synthetic emulator checks.

## Architecture

| Area | Responsibility |
|---|---|
| `apps/client` | React/Vite web experience and Capacitor client |
| `apps/client/android` | Kotlin notification listener, encrypted Room outbox, WorkManager, auth and recording bridges |
| `apps/api` | Cloudflare Worker/Hono API, D1 migrations, authentication, quotas and server-only OpenAI requests |
| `packages/domain` | Integer-paise accounting, date/category rules, parsers and CSV safety |
| `packages/contracts` | Shared validated API request and response schemas |
| `e2e` | Playwright desktop/mobile browser tests with local services and synthetic data |
| `docs/evidence` | Dated test reports and labelled synthetic screenshots |

## Deployment

The app is hosted on Cloudflare Workers and D1. Follow [security and deployment](docs/SECURITY_AND_DEPLOYMENT.md), configure actual D1 IDs, HTTPS origins, OAuth client ID and allowlist, then use the guarded scripts:

```powershell
pnpm test:deploy-safety
pnpm deploy:staging
pnpm deploy:production
```

Deployment requires an authenticated Cloudflare CLI/session and correctly configured project variables. Keep the app on Workers Free and D1 Free; do not enable paid add-ons. The current public web deployment is live, but live Google sign-in, OpenAI-backed processing, WhatsApp Business delivery and physical-phone payment-alert compatibility each have separate requirements and are not implied by a healthy homepage. See [owner actions](docs/OWNER_ACTIONS.md) and [progress](docs/PROGRESS.md).

## Android builds

```powershell
pnpm android:sync
pnpm android:debug
pnpm android:test
```

Release builds require the privately backed-up release keystore. Never commit signing files or passwords. A debug APK is for development and does not establish public-release signing or real payment-app compatibility. The original release key and physical-phone installation/capture checks remain owner-dependent; see [owner actions](docs/OWNER_ACTIONS.md).

## Privacy and limitations

TinkerSpend does not read the SMS inbox or UPI app history. Android notification access sees only notifications Android makes accessible; content can be hidden, delayed, or removed by the source app or device manufacturer. Receipt originals are kept on the capturing device. Server account data is isolated and can be exported or deleted in the app. Review [security and deployment](docs/SECURITY_AND_DEPLOYMENT.md), [costs](docs/COSTS.md), [progress](docs/PROGRESS.md), and the [test matrix](docs/TEST_MATRIX.md) before relying on any feature.

This repository’s history is preserved; it was not originally created using GitHub’s template button. See [template provenance](docs/TEMPLATE_PROVENANCE.md). Primary hackathon track: **Kill the Busywork**.
