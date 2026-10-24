# Owner actions

Only actions that need owner credentials, device interaction, or release decisions.

| # | Action | Status |
|---|---|---|
| 1 | Provide `OPENAI_API_KEY` through private local configuration (`apps/api/.dev.vars`, gitignored) and later a Worker secret; do not paste it in chat | requested; not available in this Codex environment |
| 2 | Provide `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit, D1 Edit, Account Settings Read; zone tinkercraft.in Workers Routes Edit + DNS Edit) and `CLOUDFLARE_ACCOUNT_ID` | requested |
| 3 | Google Cloud project (billing disabled), OAuth consent in Testing mode with tester emails; Web client (origins `https://expenses.tinkercraft.in`, `http://localhost:5173`); Android clients for `in.tinkercraft.tinkerspend` with release SHA-1 `81:48:00:D8:3A:E4:4B:A9:04:99:EE:2F:52:5D:7C:26:61:81:B8:D8` and debug SHA-1 `43:31:6C:CD:B9:7C:49:D4:C9:F0:84:46:E0:4F:E7:84:AF:3C:9A:22`; give Web client ID as `GOOGLE_WEB_CLIENT_ID` | requested |
| 4 | Privately back up the VM's release/debug keystores and release password. Devin's current save cards use `TINKERSPEND_RELEASE_KEYSTORE_B64`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `TINKERSPEND_DEBUG_KEYSTORE_B64`. Keep an owner-controlled copy accessible to local builds too. | No backup confirmed; never put keys/password in Git/chat |
| 5 | Reply: allowlisted Google emails, phone model + Android version, 1–2 payment apps used | requested |
| 6 | Real-device test: install APK, grant notification access, generate/receive one legitimate payment notification, report via checklist | pending APK |

The owner has an old Oppo phone available (model/Android version still unknown). A local Android VM is connected via ADB and reports Android 9. VM/synthetic checks can proceed; payment-app compatibility and Oppo background behavior still require physical-phone evidence. The minimum supported Android version is API 24 / Android 7.0.
