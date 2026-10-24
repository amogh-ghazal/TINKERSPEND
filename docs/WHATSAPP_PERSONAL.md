# Personal WhatsApp intake

This optional personal integration creates **open reviewable drafts** in the same TinkerSpend account. It never auto-commits a transaction. A WhatsApp text becomes a text draft; an image becomes a receipt draft; an audio note becomes a voice draft. The Worker downloads media only to process it and retains neither the original message body nor media. It stores only Meta's message ID, processing status and the linked WhatsApp identifier for replay protection and account routing.

## One-time owner setup

1. Create a Meta developer app and add the official WhatsApp Cloud API product. Use a dedicated WhatsApp Business number for TinkerSpend; do not automate a personal WhatsApp account or WhatsApp Web.
2. In Meta's WhatsApp configuration, set the callback URL to `https://expenses.tinkercraft.in/api/v1/whatsapp/webhook`, choose a private verification token, and subscribe to the `messages` webhook field.
3. Set these **Worker secrets** in production. Never put their values in Git, the APK, browser configuration or chat:

   ```powershell
   pnpm --filter @tinkerspend/api exec wrangler secret put WHATSAPP_VERIFY_TOKEN --env production
   pnpm --filter @tinkerspend/api exec wrangler secret put WHATSAPP_APP_SECRET --env production
   pnpm --filter @tinkerspend/api exec wrangler secret put WHATSAPP_ACCESS_TOKEN --env production
   ```

4. Apply migration `0005_whatsapp_personal.sql` to production and deploy this version of the Worker.
5. In TinkerSpend Settings, choose **Generate WhatsApp link code**, then send `LINK <code>` to the configured TinkerSpend number within ten minutes. The backend hashes the one-time code and binds the sender's WhatsApp ID to the signed-in account.

## Boundaries and validation

- Only an already linked sender can create drafts. Replayed Meta message IDs are ignored.
- The webhook verifies Meta's HMAC signature before parsing its request.
- Images use the existing 750 KiB JPEG/PNG receipt limit. Audio notes use the existing 3 MiB voice limit. Unsupported files and processing failures become an internal review status; no fabricated transaction is created.
- WhatsApp media processing uses the existing OpenAI receipt/transcription calls and limits. It therefore needs the private `OPENAI_API_KEY` Worker secret before receipt or voice processing can succeed.
- This code has not been connected to a Meta account or tested with a real WhatsApp message. Keep it marked pending until the webhook verification, sender-linking, image, voice and duplicate-message checks pass on the configured number.
