import { describe, expect, it } from "vitest";
import { normalizeSpokenMoney, parseExpenseStatement } from "../src";

describe("spoken monetary amounts", () => {
  it.each([
    ["lunch two hundred fifty", "lunch 250", 25000],
    ["paid five rupees for tea", "paid 5 rupees for tea", 500],
    ["groceries one thousand two hundred and fifty", "groceries 1250", 125000],
    ["rent one lakh twenty five thousand", "rent 125000", 12500000],
    ["coffee twenty-five point five zero rupees", "coffee 25.50 rupees", 2550],
    ["lunch two hundred", "lunch 200", 20000],
  ])("parses %s exactly", (input, normalized, paise) => {
    expect(normalizeSpokenMoney(input)).toBe(normalized);
    expect(parseExpenseStatement(input, 0)[0]?.amountPaise).toBe(paise);
  });
  it("normalizes number-internal and before splitting distinct expenses, including corrections", () => {
    expect(parseExpenseStatement("lunch two hundred and fifty and auto eighty", 0).map((d) => d.amountPaise)).toEqual([25000, 8000]);
    expect(parseExpenseStatement("auto not one hundred fifty, it was two hundred fifty", 0).map((d) => d.amountPaise)).toEqual([25000]);
  });
  it.each([
    "two coffees", "one hundred apples", "lunch twenty thirty", "lunch two hundred hundred",
    "lunch about two hundred", "lunch one point five five five rupees", "account ending two hundred",
    "balance two hundred", "OTP one hundred twenty", "lunch one thousand two thousand",
    "lunch minus two hundred", "lunch over two hundred", "lunch not two hundred",
  ])("leaves unsupported, approximate and non-monetary words unchanged: %s", (input) => {
    expect(normalizeSpokenMoney(input)).toBe(input);
    expect(parseExpenseStatement(input, 0).every((d) => d.amountPaise === null)).toBe(true);
  });
});
