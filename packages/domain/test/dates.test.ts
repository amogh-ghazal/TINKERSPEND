import { describe, expect, it } from "vitest";
import { localDateOf, monthBounds, resolveRelativeDate } from "../src/dates";

describe("IST month boundaries", () => {
  it("31 Oct 23:59 IST and 1 Nov 00:01 IST land in different months", () => {
    const a = Date.parse("2026-10-31T23:59:00+05:30");
    const b = Date.parse("2026-11-01T00:01:00+05:30");
    expect(new Date(a).toISOString()).toBe("2026-10-31T18:29:00.000Z");
    expect(localDateOf(a, "Asia/Kolkata")).toBe("2026-10-31");
    expect(localDateOf(b, "Asia/Kolkata")).toBe("2026-11-01");
    expect(localDateOf(b, "UTC")).toBe("2026-10-31");
  });
  it("month bounds", () => {
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });
});

describe("resolveRelativeDate", () => {
  const ref = Date.parse("2026-10-24T01:00:00+05:30"); // Saturday early IST, still 23 Oct UTC
  it("uses the reference instant in the user's zone", () => {
    expect(resolveRelativeDate("today", ref)).toBe("2026-10-24");
    expect(resolveRelativeDate("yesterday", ref)).toBe("2026-10-23");
    expect(resolveRelativeDate("yesterday", ref, "UTC")).toBe("2026-10-22");
    expect(resolveRelativeDate("3 days ago", ref)).toBe("2026-10-21");
    expect(resolveRelativeDate("monday", ref)).toBe("2026-10-19");
    expect(resolveRelativeDate("saturday", ref)).toBe("2026-10-17");
    expect(resolveRelativeDate("next week", ref)).toBeNull();
  });
});
