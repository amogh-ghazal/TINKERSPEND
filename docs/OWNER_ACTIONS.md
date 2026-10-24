# Owner actions

Only actions that need owner credentials, device interaction, or release decisions.

| # | Action | Status |
|---|---|---|
| 1 | Provide `OPENAI_API_KEY` through private local configuration (`apps/api/.dev.vars`, gitignored) and later a Worker secret; do not paste it in chat | requested; not available in this Codex environment |
| 2 | Cloudflare access and D1 setup | authenticated; created `tinkerspend-staging` (`1df12f82-bd83-4e00-981e-e1bbe96f25e1`) and `tinkerspend-prod` (`c9fbf336-0be0-4048-ac07-c42cff68cff3`) in APAC; all four migrations applied to both. Billing plan and DNS zone access still need verification. No Worker deployed. |
| 3 | Google Cloud project (billing disabled), OAuth consent with tester emails; Web client with actual deployment HTTPS origin and local test origins; Android client for `in.tinkercraft.tinkerspend` using the actual APK fingerprint. Current Codex debug SHA-1: `1E:7D:C1:BE:84:7E:F4:7C:49:50:3C:E1:36:0B:BE:24:1E:5B:CA:EE`; original release SHA-1: `81:48:00:D8:3A:E4:4B:A9:04:99:EE:2F:52:5D:7C:26:61:81:B8:D8` only when that key is restored and verified. Set public Web client ID as `GOOGLE_WEB_CLIENT_ID`. | pending private owner configuration; required before deployment |
| 4 | Privately back up the VM's release/debug keystores and release password. Devin's current save cards use `TINKERSPEND_RELEASE_KEYSTORE_B64`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `TINKERSPEND_DEBUG_KEYSTORE_B64`. Keep an owner-controlled copy accessible to local builds too. | No backup confirmed; required for signed public APK and future compatible updates |
| 5 | Reply: allowlisted Google emails, phone model + Android version, 1–2 payment apps used | requested |
| 6 | Real-device test: install the configured APK, enable global capture/Android notification access once, generate/receive a legitimate payment alert, verify current/new capture and public install outcome | pending working phone + live configuration |

The owner's Oppo does not turn on; the owner is looking for another Android phone. The minimum supported version is Android 7.0 / API 24. A separate AOSP Android 16 / API 36 emulator now works and passes eight native tests plus synthetic current/new capture, process/access/reboot and local-sync checks. Real payment-app/SMS notification formats and OEM background behavior remain unverified.

The earlier BlueStacks connection failed; its settings were not changed. Notification permissions/test-data reset were performed only inside the separately created dedicated test AVD. Emulator runtime/data are preserved and its launcher is in the Codex task outputs. No personal phone permissions have been changed. Actual capture setup no longer asks the end user to select individual bank/payment apps.

The Codex development builds (including 0.2.0 / code 3) use this laptop's debug signer above. Register the actual build's fingerprint for Google sign-in; the earlier Devin shared debug fingerprint does not apply to these local builds. Preserve the original release key separately. The 0.2.0 release variant currently builds unsigned for static checks, not public installation.

Before deployment, verify the actual Cloudflare account is on Workers Free/D1 Free. Configure real database IDs, the public Google client ID and exact HTTPS origins; the deploy script builds the website with that same client ID automatically. The guard refuses placeholders, fake test authentication, missing sign-in config and non-HTTPS origins. No Cloudflare account/billing state has been inspected or changed. See `SECURITY_AND_DEPLOYMENT.md`; no secret values should be pasted into chat.

Read-only CLI check on 25 October: `wrangler whoami` reports not authenticated. No login, temporary preview account, deployment, DNS or billing change was performed.
