import { describe, it, expect } from "vitest";
import { parseExpenseStatement } from "../src";

// 2026-10-24 10:30 IST, a Saturday.
const REF = Date.parse("2026-10-24T05:00:00Z");
const simple = (t: string, ref = REF) => parseExpenseStatement(t, ref).map((d) => [d.amountPaise, d.description, d.effectiveLocalDate, d.categoryId]);

describe("parseExpenseStatement", () => {
  it("splits multiple expenses and applies the date phrase to all", () => {
    expect(simple("Yesterday, lunch 180 and auto 80.")).toEqual([[18000, "lunch", "2026-10-23", "food_drinks"], [8000, "auto", "2026-10-23", "transport"]]);
  });
  it("resolves dates from the reference (recording) time in the user's zone, not now", () => {
    // 23:30 IST on Oct 31 = 18:00 UTC; "yesterday" is Oct 30 even though UTC date is the 31st and a retry may happen in November.
    expect(parseExpenseStatement("yesterday dinner 450", Date.parse("2026-10-31T18:00:00Z"))[0]!.effectiveLocalDate).toBe("2026-10-30");
    expect(parseExpenseStatement("dinner 450 today", Date.parse("2026-10-31T19:00:00Z"))[0]!.effectiveLocalDate).toBe("2026-11-01");
    expect(parseExpenseStatement("groceries 900 last friday", REF)[0]!.effectiveLocalDate).toBe("2026-10-23");
    expect(parseExpenseStatement("medicine 300 3 days ago", REF)[0]!.effectiveLocalDate).toBe("2026-10-21");
  });
  it("marks an assumed date visibly", () => {
    const [d] = parseExpenseStatement("coffee 120", REF);
    expect(d!.effectiveLocalDate).toBe("2026-10-24");
    expect(d!.assumptions).toContain("date_assumed_reference_day");
  });
  it("treats 'not 150, it was 250' as one corrected expense", () => {
    expect(simple("auto not 150, it was 250")).toEqual([[25000, "auto", "2026-10-24", "transport"]]);
    expect(simple("paid 150 no 250 for the cab")).toEqual([[25000, "cab", "2026-10-24", "transport"]]);
  });
  it("never uses account digits, balance or reference numbers as the amount", () => {
    const r = parseExpenseStatement("Paid 499 for broadband from account ending 4321, balance Rs 12,345.67, UPI ref 512345678901", REF);
    expect(r).toHaveLength(1);
    expect(r[0]!.amountPaise).toBe(49900);
  });
  it("keeps unclear or missing amounts null instead of guessing", () => {
    const [a] = parseExpenseStatement("lunch some money", REF);
    expect(a!.amountPaise).toBeNull();
    expect(a!.assumptions).toContain("amount_missing");
    const [b] = parseExpenseStatement("snacks 40 50", REF);
    expect(b!.amountPaise).toBeNull();
    expect(b!.assumptions).toContain("multiple_amounts");
  });
  it("handles rupee symbols, k suffix and description-then-amount ordering", () => {
    expect(simple("rent ₹15,000")).toEqual([[1500000, "rent", "2026-10-24", "housing_bills"]]);
    expect(simple("spent 1.5k on groceries")).toEqual([[150000, "groceries", "2026-10-24", "groceries"]]);
    expect(simple("vegetables, 120")).toEqual([[12000, "vegetables", "2026-10-24", "groceries"]]);
  });
  it("flags foreign currency instead of converting", () => {
    const [d] = parseExpenseStatement("netflix 10 dollars", REF);
    expect(d!.currency).toBe("USD");
    expect(d!.amountPaise).toBeNull();
    expect(d!.assumptions).toContain("non_inr_currency");
  });
});
