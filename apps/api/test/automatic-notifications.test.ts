import { describe, expect, it } from "vitest";
import { call, loginAndroid, uuid } from "./helpers";

const event = (source: string, title: string, text: string) => ({
  event_id: uuid(), source_package: source, source_key_hash: "synthetic-key", posted_at: Date.parse("2026-10-24T06:00:00Z"), captured_at: Date.now(),
  content_hash: crypto.randomUUID().replace(/-/g, "").repeat(2), parser_version: "kt-2", title, text, timezone: "Asia/Kolkata",
});
describe("automatic notification register", () => {
  it("dedupes app + bank alert; keeps time/bank, and asks rather than guesses on unknown debits", async () => {
    const a = await loginAndroid("auto-a", "auto-a@e2e.test");
    const send = (e: ReturnType<typeof event>) => call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [e] } });
    const first = await send(event("com.phonepe.app", "Paid", "Paid Rs.180 to Zomato. UPI Ref No 512345678901"));
    expect(first.json.acks[0].status).toBe("accepted");
    const second = await send(event("com.google.android.apps.messaging", "VM-HDFCBK-S", "Rs.180 debited to Zomato. UPI UTR 512345678901"));
    expect(second.json.acks[0]).toMatchObject({ status: "duplicate", transaction_id: first.json.acks[0].transaction_id });
    const ledger = await call("GET", "/api/v1/transactions", { token: a.token });
    expect(ledger.json.items).toHaveLength(1);
    expect(ledger.json.items[0]).toMatchObject({ kind: "expense", review_state: "confirmed", notification_posted_at: Date.parse("2026-10-24T06:00:00Z"), reported_bank: "HDFC Bank" });
    const unknown = await send(event("com.phonepe.app", "Paid", "Paid Rs.250 to Ravi K. UPI Ref No 512345678902"));
    const detail = await call("GET", `/api/v1/transactions/${unknown.json.acks[0].transaction_id}`, { token: a.token });
    expect(detail.json.transaction).toMatchObject({ kind: "unknown", review_state: "needs_review", reported_bank: null });
    const explain = await call("PATCH", `/api/v1/transactions/${detail.json.transaction.id}`, { token: a.token, body: { version: detail.json.transaction.version, kind: "expense", category_id: "food_drinks", description: "Dinner with friends", review_state: "confirmed" } });
    expect(explain.json.transaction).toMatchObject({ kind: "expense", review_state: "confirmed", description: "Dinner with friends" });
    const csv = await call("GET", "/api/v1/export.csv", { token: a.token });
    expect(csv.text).toContain("notification_time_utc,reported_bank");
    expect(csv.text).toContain("HDFC Bank");
  });
  it("rejects personal/OTP message notifications and does not collapse opposite transaction directions", async () => {
    const a = await loginAndroid("auto-b", "auto-b@e2e.test");
    const send = (e: ReturnType<typeof event>) => call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [e] } });
    expect((await send(event("com.google.android.apps.messaging", "Rahul", "Paid Rs.100 to Ravi"))).json.acks[0].status).toBe("rejected");
    expect((await send(event("com.google.android.apps.messaging", "VM-HDFCBK", "OTP 123456 for payment Rs.100"))).json.acks[0].status).toBe("ignored");
    await send(event("com.phonepe.app", "Received", "Rs.100 received from Ravi K. UPI Ref No 612345678901"));
    await send(event("com.phonepe.app", "Paid", "Paid Rs.100 to Ravi K. UPI Ref No 612345678901"));
    const ledger = await call("GET", "/api/v1/transactions", { token: a.token });
    expect(ledger.json.items).toHaveLength(2);
    expect(new Set(ledger.json.items.map((t: { direction: string }) => t.direction))).toEqual(new Set(["incoming", "outgoing"]));
    const outsider = await loginAndroid("auto-c", "auto-c@e2e.test");
    expect((await call("GET", "/api/v1/transactions", { token: outsider.token })).json.items).toEqual([]);
  });
  it("keeps similar reference-free alerts as review candidates, without doubling spending", async () => {
    const a = await loginAndroid("auto-duplicates", "auto-duplicates@e2e.test");
    const send = (e: ReturnType<typeof event>) => call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [e] } });
    await send(event("com.phonepe.app", "Paid", "Paid Rs.180 to Zomato."));
    await send(event("com.google.android.apps.messaging", "VM-HDFCBK", "Rs.180 debited to Zomato."));
    const rows = (await call("GET", "/api/v1/transactions", { token: a.token })).json.items as Array<{ review_state: string; capture_warnings: string[] }>;
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.review_state === "confirmed")).toHaveLength(1);
    expect(rows.find((r) => r.review_state === "needs_review")?.capture_warnings).toContain("possible_duplicate");
    expect((await call("GET", "/api/v1/summary?month=2026-10", { token: a.token })).json.grossSpendingPaise).toBe(18000);
  });
  it("clears conflicting bank evidence and preserves a user's purpose on later alerts", async () => {
    const a = await loginAndroid("auto-conflict", "auto-conflict@e2e.test");
    const send = (e: ReturnType<typeof event>) => call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [e] } });
    const first = await send(event("com.snapwork.hdfc", "Paid", "Paid Rs.180 to Zomato. UPI Ref No 712345678901"));
    const id = first.json.acks[0].transaction_id;
    const initial = (await call("GET", `/api/v1/transactions/${id}`, { token: a.token })).json.transaction;
    await call("PATCH", `/api/v1/transactions/${id}`, { token: a.token, body: { version: initial.version, kind: "transfer", description: "User corrected this as a transfer", review_state: "confirmed" } });
    await send(event("com.csam.icici.bank.imobile", "Paid", "Paid Rs.180 to Zomato. UPI Ref No 712345678901"));
    const rows = (await call("GET", "/api/v1/transactions", { token: a.token })).json.items;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "transfer", description: "User corrected this as a transfer", reported_bank: null, review_state: "needs_review" });
    expect(rows[0].capture_warnings).toContain("bank_conflict");
    const later = event("com.snapwork.hdfc", "Paid", "Paid Rs.180 to Zomato. UPI Ref No 712345678901");
    later.posted_at += 1000;
    await send(later);
    const updated = (await call("GET", `/api/v1/transactions/${id}`, { token: a.token })).json.transaction;
    expect(updated.reported_bank).toBeNull(); // later repeats cannot erase a known conflict
    expect(updated.capture_warnings).toContain("bank_conflict");
  });
});
