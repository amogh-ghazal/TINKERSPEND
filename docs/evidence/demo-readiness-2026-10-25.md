# Demo readiness — 25 October 2026

## Verified

- Production `https://expenses.tinkercraft.in/` responds successfully. `/api/v1/health` reports `ok: true` and `env: production`.
- Latest local verification: lint and typecheck passed; 68 domain tests passed; 51 API tests passed against local workerd/D1 with OpenAI mocked; 20 desktop/mobile Playwright tests passed; deployment-safety tests passed 12/12.
- SuperMoney share-to-chat is covered by the browser test. The sample payment becomes a reviewable draft, and a timely purpose reply updates that draft.
- The three screenshots in this folder were generated with synthetic fixture content and mocked browser/API behavior. They are presentation evidence for the prototype flow only.
- No live OpenAI requests were made during this checkpoint; tests use mocked provider responses.

## Still required for live AI

`wrangler secret list --env production` returned an empty list. The production Worker therefore does not currently have `OPENAI_API_KEY`; the local `apps/api/.dev.vars` file is also absent. The server checks the key before attempting model requests. As a result, API-key handling is implemented and mock-tested, but actual receipt extraction and audio transcription are not configured or verified in production.

The owner shared a key in chat during this checkpoint, then it was accidentally entered at a regular PowerShell prompt and interpreted as a command. It was not saved to the Worker; the separate unused Wrangler prompt was cancelled. The matching local PowerShell history entry was removed. Treat that key as exposed: revoke it in the OpenAI dashboard, create a replacement, and enter the replacement only at Wrangler's interactive prompt after starting this command in the actual repository terminal:

```powershell
pnpm --filter @tinkerspend/api exec wrangler secret put OPENAI_API_KEY --env production
```

Do not paste the replacement into chat, source files, browser/client configuration, screenshots, or Git. Run the command from the repository's actual terminal and wait until Wrangler displays `Enter a secret value:` before typing it. After setting it, verify only that Wrangler lists the secret name (not its value). Do not make a paid API call just to check presence. A real end-to-end provider check should be a deliberate owner-approved demo action, because it will use API credits.

## Demo boundaries

The WhatsApp-style screen and SuperMoney share sequence are an in-app TinkerSpend concept demo. The sample payment, payee and reference are synthetic. The UI does not open WhatsApp, contact Meta, deliver a message, call SuperMoney, or move money. Live Google sign-in, real-device notification behavior and WhatsApp Business delivery have separate configuration/testing requirements and are not established by this web test checkpoint.
