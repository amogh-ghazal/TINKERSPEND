# Owner actions

Only actions that need owner credentials, device interaction, or release decisions.

| # | Action | Status |
|---|---|---|
| 1 | Provide `OPENAI_API_KEY` privately, then set it as a Worker secret; never paste it into chat or the APK | API credit grant is active; an API key has not been created or stored as a Worker secret, so AI, voice and receipt features remain disabled. |
| 2 | Cloudflare access and D1 setup | `expenses.tinkercraft.in` is deployed on Cloudflare Workers Free + D1 Free. Production and staging D1 databases are migrated; production HTTPS homepage and API-health smoke checks passed. |
| 3 | Google Cloud project (billing disabled), OAuth consent with tester emails; Web client with actual deployment HTTPS origin and local test origins; Android client for `in.tinkercraft.tinkerspend` using the actual APK fingerprint. Current Codex debug SHA-1: `1E:7D:C1:BE:84:7E:F4:7C:49:50:3C:E1:36:0B:BE:24:1E:5B:CA:EE`; original release SHA-1: `81:48:00:D8:3A:E4:4B:A9:04:99:EE:2F:52:5D:7C:26:61:81:B8:D8` only when that key is restored and verified. Set public Web client ID as `GOOGLE_WEB_CLIENT_ID`. | Web client configured for `https://expenses.tinkercraft.in`; Android OAuth clients and live sign-in validation remain pending |
| 4 | Privately back up the VM's release/debug keystores and release password. Devin's current save cards use `TINKERSPEND_RELEASE_KEYSTORE_B64`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `TINKERSPEND_DEBUG_KEYSTORE_B64`. Keep an owner-controlled copy accessible to local builds too. | Owner says this was set up in Devin; no keystore artifact exists in tracked GitHub files. Retrieve/export privately for local signing; never commit keys/passwords. Required for signed public APK and future compatible updates. |
| 5 | Reply: allowlisted Google emails, phone model + Android version, 1–2 payment apps used | requested |
| 6 | Real-device test: install the configured APK, enable global capture/Android notification access once, generate/receive a legitimate payment alert, verify current/new capture and public install outcome | pending working phone + live configuration |

The owner's Oppo does not turn on; the owner is looking for another Android phone. The minimum supported version is Android 7.0 / API 24. A separate AOSP Android 16 / API 36 emulator now works and passes eight native tests plus synthetic current/new capture, process/access/reboot and local-sync checks. Real payment-app/SMS notification formats and OEM background behavior remain unverified.

The earlier BlueStacks connection failed; its settings were not changed. Notification permissions/test-data reset were performed only inside the separately created dedicated test AVD. Emulator runtime/data are preserved and its launcher is in the Codex task outputs. No personal phone permissions have been changed. Actual capture setup no longer asks the end user to select individual bank/payment apps.

The Codex development builds (including 0.2.0 / code 3) use this laptop's debug signer above. Register the actual build's fingerprint for Google sign-in; the earlier Devin shared debug fingerprint does not apply to these local builds. Preserve the original release key separately. The 0.2.0 release variant currently builds unsigned for static checks, not public installation.

Cloudflare OAuth is authenticated, the account domain is on the Free Website plan, and `expenses.tinkercraft.in` is live on Workers Free + D1 Free. The production Web OAuth client is configured for that exact HTTPS origin. The guard refuses placeholders, fake test authentication, missing sign-in config and non-HTTPS origins. See `SECURITY_AND_DEPLOYMENT.md`; no secret values should be pasted into chat.

Live Google sign-in, Android OAuth client setup, OpenAI secret configuration and physical-device validation remain pending. Staging and production D1 databases are created and migrated.
