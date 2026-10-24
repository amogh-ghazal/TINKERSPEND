# Owner actions

Only actions that need owner credentials, device interaction, or release decisions.

| # | Action | Status |
|---|---|---|
| 1 | Provide `OPENAI_API_KEY` via Devin secret prompt (repo-scoped) | requested |
| 2 | Provide `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit, D1 Edit, Account Settings Read; zone tinkercraft.in Workers Routes Edit + DNS Edit) and `CLOUDFLARE_ACCOUNT_ID` | requested |
| 3 | Google Cloud project (billing disabled), OAuth consent in Testing mode with tester emails; Web client (origins `https://expenses.tinkercraft.in`, `http://localhost:5173`); Android clients for `in.tinkercraft.tinkerspend` with release SHA-1 `81:48:00:D8:3A:E4:4B:A9:04:99:EE:2F:52:5D:7C:26:61:81:B8:D8` and debug SHA-1 `43:31:6C:CD:B9:7C:49:D4:C9:F0:84:46:E0:4F:E7:84:AF:3C:9A:22`; give Web client ID as `GOOGLE_WEB_CLIENT_ID` | requested |
| 4 | Save the generated signing keystores as secrets (`ANDROID_RELEASE_KEYSTORE_B64`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `ANDROID_DEBUG_KEYSTORE_B64`) | requested |
| 5 | Reply: allowlisted Google emails, phone model + Android version, 1–2 payment apps used | requested |
| 6 | Real-device test: install APK, grant notification access, generate/receive one legitimate payment notification, report via checklist | pending APK |
