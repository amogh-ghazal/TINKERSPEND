# Test matrix

| Area | Case | Expected | Actual | Env | Date |
|---|---|---|---|---|---|
| Domain | ₹1,23,456.78 → 12,345,678 paise; 0.10+0.20=0.30 | exact | pass | vitest 4.1.12, Node 22 | 2026-10-24 |
| Domain | Ledger fixture (§19) | gross ₹560, refunds ₹50, net ₹510, review ₹250, pending ₹700 | pass (pure function) | vitest | 2026-10-24 |
| Domain | 31 Oct 23:59 IST vs 1 Nov 00:01 IST | different months | pass | vitest | 2026-10-24 |
| Parser | 15 SYNTHETIC notification fixtures | as labelled | pass (synthetic only) | vitest | 2026-10-24 |
| Android | Real device capture | event captured with UI closed | not tested (no device yet) | — | — |
| Android (emulator) | Listener bound via notification access; app UI never opened (MainActivity count 0); SYNTHETIC fixture app posts: success ×2 same notification, OTP, promo, distinct second payment | 2 captured (repeat callback collapsed), OTP/promo filtered locally | pass: pending=2, failed=0 — `docs/evidence/m0-emulator-listener-logcat.txt` | Android 16 emulator (API 36 google_apis x86_64), debug APK | 2026-10-24 |
| API (workerd/Miniflare D1, local) | Auth: allowlist, single-use challenge, nonce, audience, unverified email, logout, device revoke, CSRF, bearer-vs-web | reject/accept as specified | pass (11/11 tests) | vitest-pool-workers 0.23, workerd 2026-08-22 | 2026-10-24 |
| API (local) | Ledger fixture through HTTP+D1; isolation A/B; idempotent create; version conflict; partial refund bound; reversal guard; cross-month refund; bad money; 413; CSV formula | as §19 | pass | same | 2026-10-24 |
| API (local) | Notification ingest: replay, repost, distinct same-value, OTP, batch>5, device mismatch, cross-user, pending→success, stale pending, web upload refused | as specified | pass | same | 2026-10-24 |
| Android (emulator) | Process killed (kill -9) → synthetic notification | captured after system restart of listener | pass (pending 2→3) | API 36 emulator, debug | 2026-10-24 |
| Android (emulator) | Notification access revoked → notification | not captured; status listener=false | pass (pending stays 3) | same | 2026-10-24 |
| Android (emulator) | Access re-granted → notification | captured | pass (pending 4) | same | 2026-10-24 |
| Android (emulator) | Reboot, app never opened → notification | captured | pass (pending 5) | same | 2026-10-24 |
| Android (emulator) | Force-stop → notification | spec: unsupported, no promise | observed: listener rebound and captured on this emulator; NOT claimed as supported (OEM/real-device behaviour differs) | same | 2026-10-24 |
| Browser E2E (Playwright, local wrangler dev + local D1, test-only token verifier APP_ENV=test) | §19 baseline entered through the UI incl. over-limit refund rejection | gross ₹560, refunds ₹50, net ₹510, review ₹250, pending ₹700 | pass (desktop Chrome + Pixel 7 viewport) | `pnpm test:e2e`; screenshot docs/evidence/m1-e2e-overview-mobile.png | 2026-10-24 |
| Browser E2E | Second allowlisted user sees ₹0 for owner's month | isolation | pass (both viewports) | same | 2026-10-24 |
| Browser E2E | Unknown → review queue → edit to expense/Groceries leaves queue; CSV export neutralizes `=HYPERLINK`; delete | as specified | pass (both viewports) | same | 2026-10-24 |
| Browser E2E | Signed-out: sign-in screen only; `/api/v1/transactions` → 401 | as specified | pass | same | 2026-10-24 |
| Real Google sign-in (web + Android) | GIS button / Credential Manager with real client IDs | — | **pending**: needs GOOGLE_WEB_CLIENT_ID + OAuth clients (owner action) | — | — |
| Android (emulator) → local Worker/D1 | Native outbox → WorkManager → `POST /notifications/batch` with natively stored bearer session (debug-only injection, no Google); SYNTHETIC fixture: success, pending→success same ref, income | 4 events acked; one txn per ref (pending upgraded to successful); income confirmed; outgoing w/o merchant evidence → review | pass — `docs/evidence/m2-emulator-sync.txt` | API 36 emulator, debug APK (`TS_API_BASE_URL_DEBUG=http://10.0.2.2:8787`), `wrangler dev` local D1 | 2026-10-24 |
| Android (emulator) | Account switch: 6 events queued under previous owner, new owner bound | old-owner events never uploaded under new account | pass (pending stays 6 after sync) | same | 2026-10-24 |
| Android (emulator) | Network failure (host unresolvable) then user "Sync now" | events kept pending; REPLACE policy runs sync immediately instead of waiting behind backoff | pass after fix (first run waited ~60 s in backoff) | same | 2026-10-24 |
| Domain | Counterparty stops at status words ("Metro Mart is pending" → "Metro Mart") | as specified | pass (found on emulator run; 37/37) | vitest | 2026-10-24 |
| Android real device → deployed Worker | Same as above with real payment app and Cloudflare deployment | — | **pending**: owner device + Cloudflare credentials | — | — |
