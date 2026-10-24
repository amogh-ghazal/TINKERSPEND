# Decisions

## Toolchain pins (2026-10-24)
| Tool | Version |
|---|---|
| Node.js | 22.23.4 (LTS "Jod") |
| pnpm | 10.18.0 |
| TypeScript | 5.9.3 (TS 7.x not used: typescript-eslint supports <6.1) |
| React / React DOM | 19.3.1 |
| Vite / @vitejs/plugin-react | 8.3.5 / 6.1.2 |
| Capacitor core/cli/android | 8.5.3 (stable 8.x; generated compile/target SDK 36, min SDK 24, AGP 8.13.0, Gradle 8.14.3) |
| JDK | 21 (required by Capacitor 8 Android) |
| Kotlin / KSP | 2.3.21 / 2.3.12 |
| Room / WorkManager | 2.8.4 / 2.11.2 |
| Wrangler | 4.152.0 |
| Hono / jose / zod | 4.13.13 / 6.2.13 / 4.6.7 |
| Vitest / @cloudflare/vitest-pool-workers | 4.1.12 / 0.23.0 |
| Android emulator image | android-36 google_apis x86_64 (Android 16) |

## Identity
- Android applicationId: `in.tinkercraft.tinkerspend` (Kotlin package uses backtick-escaped `` `in` ``).
- Release signing: RSA-4096 keystore alias `tinkerspend`, SHA-256 `A4:AB:91:C3:56:22:A9:D5:63:8B:66:33:49:40:7C:8E:2D:EE:CB:EA:E2:2A:9B:F7:0D:16:8A:BE:07:CB:C3:60`. Stored only in owner-saved Devin secrets.

## Native capture
- Local dedupe key: (owner, package, key hash, content hash, `Notification.when`). Repeated callbacks of the same notification collapse; a content/status change or a later distinct payment (different `when`) is kept.
- Local prefilter (amount marker + payment word, no OTP/promo) in Kotlin; full deterministic parse server-side from `packages/domain` (single implementation).
- Session token never returned to JavaScript: native performs login exchange and authenticated requests through an allowlisted path bridge.

## Accounting
- Integer paise; strict decimal parser; refunds counted in month received; spending counted only via allocations.
- Refund allocation default: proportional to original allocations with largest-remainder rounding (ties to earliest allocation).

## M3 classification (2026-10-24)
- Priority: explicit user edit → saved user rule → tested merchant map → AI suggestion → review. AI output is stored in `txn_suggestions` only; it never changes `kind`, `review_state` or allocations. The user accepts explicitly.
- `ai_operations` implements the §14 state machine. Failures that happened before an upstream call (quota, missing key, provider 429 rate limit) are re-claimable under the same operation ID; `outcome_unknown` is never retried automatically. At most 3 upstream-started attempts per transaction.
- Quotas: atomic conditional upserts (`ON CONFLICT … DO UPDATE … WHERE count < limit`); zero changed rows means denied. The user slot is reserved first and compensated if the global slot is denied. Defaults: 50 classify/user/day, 100 AI calls/day global (`AI_USER_CLASSIFY_LIMIT`, `AI_DAILY_GLOBAL_LIMIT`).
- Data sent: payee name, amount, direction, payment status, short note. No references, VPAs or history. `store: false` (controls response storage only; not a zero-retention guarantee).
- Model: `OPENAI_CATEGORY_MODEL` falls back to `OPENAI_EXTRACT_MODEL` (`gpt-4.1-mini` placeholder). **Not verified** against the owner's account; must be confirmed when OPENAI_API_KEY is provided.
- Native enrichment jobs: 5xx deferred (Retry-After honoured) and failed after 5 attempts, so a missing key cannot cause an unbounded loop.

## M4 typed/voice drafts (2026-10-24)
- Text: AI extraction when enabled/configured and within quota; otherwise (AI off, no key, quota, provider error, refusal, invalid output, timeout) the deterministic `parseExpenseStatement` produces drafts, so typed input is never lost. Response says which method was used.
- The model copies amounts and date phrases verbatim; the server resolves dates from `reference_time` (typing/recording start) in the user's zone and drops any amount whose digits do not appear in the source text (`amount_not_in_source`).
- Voice: the client keeps the recording until drafts are created. Uploads are validated (MIME allowlist, ≤3 MiB, ≤60 s) and quota-reserved before any provider call. A transcription timeout is `outcome_unknown` and is not retried under the same operation; the user can explicitly retry (new operation) or type instead. Audio is never stored server-side.
- Drafts expire after 7 days; the original text/transcript is removed on save, discard or expiry. Saving requires amount, date, INR and an explicit "I paid this" for successful expenses; provenance is `self_reported`.

## M5 receipts (2026-10-24)
- Client re-encodes every photo to JPEG (orientation applied, EXIF/location dropped, long edge ≤2000 px, ≤750 KiB). The normalized original is kept only on the capturing device (IndexedDB / app-private WebView storage); the server stores a user-scoped SHA-256 for duplicate warnings, never the image.
- The model copies printed figures; the server parses them into paise and checks lines + taxes + fees − discounts = total exactly. Any mismatch, unreadable figure or >60 lines blocks the split save until corrected; the user may explicitly save the total only. No balancing line is ever invented.
- Split allocations: total distributed over line-item category sums with largest-remainder rounding (ties to the earlier category), so allocations always equal the parent amount.
- Matching: same amount, ±2 days, expense/unknown, not already linked; merchant similarity raises rank. Never auto-merged. Attach requires equal amounts, records `receipt_links(mode='attached')` and can be undone (`/drafts/:id/detach`).
