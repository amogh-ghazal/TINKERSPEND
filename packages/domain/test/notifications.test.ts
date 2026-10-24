import { describe, expect, it } from "vitest";
import { looksLikePersonName, parsePaymentNotification } from "../src/notifications";
import fixtures from "../../../fixtures/notifications.synthetic.json";

describe("synthetic notification fixtures (NOT real device captures)", () => {
  for (const f of fixtures.cases) {
    it(f.name, () => {
      const r = parsePaymentNotification(f.input);
      expect(r.type).toBe(f.expect.type);
      if (r.type === "payment" && f.expect.type === "payment") {
        expect(r.amountPaise).toBe(f.expect.amountPaise);
        if (f.expect.direction) expect(r.direction).toBe(f.expect.direction);
        if (f.expect.status) expect(r.status).toBe(f.expect.status);
        if (f.expect.kindHint) expect(r.kindHint).toBe(f.expect.kindHint);
        if ("counterparty" in f.expect) expect(r.counterparty).toBe(f.expect.counterparty);
        if ("reference" in f.expect) expect(r.reference).toEqual(f.expect.reference);
      }
      if (r.type === "ignored" && f.expect.type === "ignored" && f.expect.reason) expect(r.reason).toBe(f.expect.reason);
    });
  }
});

describe("person-name heuristic", () => {
  it("distinguishes people and merchants", () => {
    expect(looksLikePersonName("Rahul Sharma")).toBe(true);
    expect(looksLikePersonName("Sri Balaji Stores")).toBe(false);
    expect(looksLikePersonName("Swiggy Limited")).toBe(false);
  });
});
