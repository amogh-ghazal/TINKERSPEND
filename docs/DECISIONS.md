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
