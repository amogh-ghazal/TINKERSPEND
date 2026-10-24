import { describe, expect, it } from "vitest";
import { evaluateStatusTransition, refundWithinLimit, summarizeMonth, type LedgerTransaction } from "../src/accounting";
import { allocateProportionally } from "../src/money";
import { reconcileReceipt } from "../src/receipt";
import { strongMatch, suggestMatches } from "../src/reconcile";
import { csvCell } from "../src/csv";

const base = { deleted: false, direction: "outgoing" as const };
const refundAlloc = allocateProportionally(5_000, [20_000, 10_000]);

/** Ledger regression fixture from spec §19 (one month, Oct 2026). */
export const LEDGER_FIXTURE: LedgerTransaction[] = [
  { ...base, id: "rest", amountPaise: 18_000, kind: "expense", paymentStatus: "successful", reviewState: "confirmed", effectiveLocalDate: "2026-10-05", allocations: [{ categoryId: "food_drinks", amountPaise: 18_000 }] },
  { ...base, id: "auto", amountPaise: 8_000, kind: "expense", paymentStatus: "successful", reviewState: "confirmed", effectiveLocalDate: "2026-10-06", allocations: [{ categoryId: "transport", amountPaise: 8_000 }] },
  { ...base, id: "split", amountPaise: 30_000, kind: "expense", paymentStatus: "successful", reviewState: "confirmed", effectiveLocalDate: "2026-10-07", allocations: [{ categoryId: "groceries", amountPaise: 20_000 }, { categoryId: "household", amountPaise: 10_000 }] },
  { ...base, id: "refund", direction: "incoming", amountPaise: 5_000, kind: "refund", paymentStatus: "successful", reviewState: "confirmed", effectiveLocalDate: "2026-10-09", allocations: [{ categoryId: "groceries", amountPaise: refundAlloc[0]! }, { categoryId: "household", amountPaise: refundAlloc[1]! }] },
  { ...base, id: "self", amountPaise: 200_000, kind: "transfer", paymentStatus: "successful", reviewState: "confirmed", effectiveLocalDate: "2026-10-10", allocations: [] },
  { ...base, id: "failed", amountPaise: 40_000, kind: "expense", paymentStatus: "failed", reviewState: "confirmed", effectiveLocalDate: "2026-10-11", allocations: [{ categoryId: "shopping", amountPaise: 40_000 }] },
  { ...base, id: "pending", amountPaise: 70_000, kind: "expense", paymentStatus: "pending", reviewState: "needs_review", effectiveLocalDate: "2026-10-12", allocations: [{ categoryId: "uncategorized", amountPaise: 70_000 }] },
  { ...base, id: "salary", direction: "incoming", amountPaise: 100_000, kind: "income", paymentStatus: "successful", reviewState: "confirmed", effectiveLocalDate: "2026-10-01", allocations: [] },
  { ...base, id: "person", amountPaise: 25_000, kind: "unknown", paymentStatus: "successful", reviewState: "needs_review", effectiveLocalDate: "2026-10-13", allocations: [] },
];

describe("ledger regression fixture", () => {
  const s = summarizeMonth("2026-10", LEDGER_FIXTURE);
  it("matches the spec baseline", () => {
    expect(s.grossSpendingPaise).toBe(56_000);
    expect(s.refundsPaise).toBe(5_000);
    expect(s.netSpendingPaise).toBe(51_000);
    expect(s.needsReview).toEqual({ count: 1, amountPaise: 25_000 });
    expect(s.pending).toEqual({ count: 1, amountPaise: 70_000 });
  });
  it("category sums equal totals", () => {
    expect(s.byCategory.reduce((a, c) => a + c.spentPaise, 0)).toBe(s.grossSpendingPaise);
    expect(s.byCategory.reduce((a, c) => a + c.refundedPaise, 0)).toBe(s.refundsPaise);
    expect(s.byCategory.reduce((a, c) => a + c.netPaise, 0)).toBe(s.netSpendingPaise);
  });
  it("cross-month refund reduces the month received", () => {
    const oct = [{ ...LEDGER_FIXTURE[2]! }];
    const novRefund: LedgerTransaction = { ...LEDGER_FIXTURE[3]!, id: "nov", effectiveLocalDate: "2026-11-02" };
    expect(summarizeMonth("2026-10", [...oct, novRefund]).netSpendingPaise).toBe(30_000);
    expect(summarizeMonth("2026-11", [...oct, novRefund]).netSpendingPaise).toBe(-5_000);
  });
  it("deleted transactions are excluded", () => {
    const t = LEDGER_FIXTURE.map((x) => (x.id === "auto" ? { ...x, deleted: true } : x));
    expect(summarizeMonth("2026-10", t).grossSpendingPaise).toBe(48_000);
  });
});

describe("status transitions", () => {
  it("never downgrades newer success with stale pending", () => {
    expect(evaluateStatusTransition("successful", "pending").allowed).toBe(false);
    expect(evaluateStatusTransition("pending", "successful").allowed).toBe(true);
    expect(evaluateStatusTransition("successful", "reversed").allowed).toBe(true);
    expect(evaluateStatusTransition("pending", "reversed").allowed).toBe(false);
    expect(evaluateStatusTransition("reversed", "successful").allowed).toBe(false);
  });
  it("partial refunds bounded", () => {
    expect(refundWithinLimit(30_000, 0, 5_000)).toBe(true);
    expect(refundWithinLimit(30_000, 28_000, 5_000)).toBe(false);
  });
});

describe("receipt arithmetic", () => {
  it("reconciles exactly or flags mismatch", () => {
    expect(reconcileReceipt({ totalPaise: 30_000, lineItemPaise: [18_000, 10_000], taxesPaise: [2_500], feesPaise: [0], discountsPaise: [500] }).ok).toBe(true);
    const bad = reconcileReceipt({ totalPaise: 30_000, lineItemPaise: [18_000, 10_000], taxesPaise: [], feesPaise: [], discountsPaise: [] });
    expect(bad).toMatchObject({ ok: false, reason: "mismatch", differencePaise: 2_000 });
  });
});

describe("matching", () => {
  const cands = [{ id: "a", amountPaise: 18_000, effectiveLocalDate: "2026-10-05", counterparty: "Meghana Foods", kind: "expense", references: [{ namespace: "upi_ref", value: "412345678901" }] }];
  it("strong match needs same namespace", () => {
    expect(strongMatch({ amountPaise: 18_000, effectiveLocalDate: "2026-10-05", counterparty: null, kind: "expense", reference: { namespace: "upi_ref", value: "412345678901" } }, cands)?.id).toBe("a");
    expect(strongMatch({ amountPaise: 18_000, effectiveLocalDate: "2026-10-05", counterparty: null, kind: "expense", reference: { namespace: "txn_id", value: "412345678901" } }, cands)).toBeNull();
  });
  it("same-value purchases only suggested", () => {
    expect(suggestMatches({ amountPaise: 18_000, effectiveLocalDate: "2026-10-05", counterparty: "meghana", kind: "expense", reference: null }, cands)[0]?.candidate.id).toBe("a");
  });
});

describe("csv", () => {
  it("neutralises formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
});
