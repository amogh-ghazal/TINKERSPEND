# Test matrix

| Area | Case | Expected | Actual | Env | Date |
|---|---|---|---|---|---|
| Domain | ₹1,23,456.78 → 12,345,678 paise; 0.10+0.20=0.30 | exact | pass | vitest 4.1.12, Node 22 | 2026-10-24 |
| Domain | Ledger fixture (§19) | gross ₹560, refunds ₹50, net ₹510, review ₹250, pending ₹700 | pass (pure function) | vitest | 2026-10-24 |
| Domain | 31 Oct 23:59 IST vs 1 Nov 00:01 IST | different months | pass | vitest | 2026-10-24 |
| Parser | 15 SYNTHETIC notification fixtures | as labelled | pass (synthetic only) | vitest | 2026-10-24 |
| Android | Real device capture | event captured with UI closed | not tested (no device yet) | — | — |
