import { describe, expect, it } from "vitest";
import { allocateProportionally, formatINR, parseRupeesToPaise } from "../src/money";

const ok = (s: string) => {
  const r = parseRupeesToPaise(s);
  if (!r.ok) throw new Error(`${s}: ${r.error}`);
  return r.paise;
};

describe("parseRupeesToPaise", () => {
  it("parses Indian grouping exactly", () => {
    expect(ok("₹1,23,456.78")).toBe(12_345_678);
    expect(ok("1,23,456.78")).toBe(12_345_678);
    expect(ok("Rs. 2,000")).toBe(200_000);
    expect(ok("INR 180.5")).toBe(18_050);
    expect(ok("12.500")).toBe(1250);
  });
  it("adds without float error", () => {
    expect(ok("0.10") + ok("0.20")).toBe(ok("0.30"));
    expect(formatINR(ok("0.10") + ok("0.20"))).toBe("₹0.30");
  });
  it("rejects bad input", () => {
    for (const [s, e] of [["", "empty"], ["-5", "negative"], ["1.234", "too_many_decimals"], ["1,2,3", "invalid_format"], ["abc", "invalid_format"], ["0", "zero"], ["NaN", "invalid_format"], ["Infinity", "invalid_format"], ["1e5", "invalid_format"], ["99999999999999", "out_of_range"]] as const) {
      const r = parseRupeesToPaise(s);
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.error, s).toBe(e);
    }
  });
  it("formats with Indian grouping", () => {
    expect(formatINR(12_345_678)).toBe("₹1,23,456.78");
    expect(formatINR(56_000)).toBe("₹560.00");
  });
});

describe("allocateProportionally", () => {
  it("sums exactly with deterministic remainder", () => {
    const a = allocateProportionally(5_000, [20_000, 10_000]);
    expect(a.reduce((x, y) => x + y, 0)).toBe(5_000);
    expect(a).toEqual([3_333, 1_667]);
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });
});
