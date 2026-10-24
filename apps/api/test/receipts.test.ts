import { describe, it, expect, vi, afterEach } from "vitest";
import { call, loginAndroid, uuid } from "./helpers";

const REF = Date.now() - 3600_000;
const ist = (ms: number, days = 0) => new Date(ms + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
const TODAY = ist(REF);

function mockOpenAI(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const real = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.openai.com/")) return real(input, init);
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return handler(url, init);
  });
  return calls;
}
const ok = (obj: unknown) => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }], usage: { input_tokens: 900, output_tokens: 200 } }), { status: 200 });
const rc = (o: Record<string, unknown>) => ({ legible: true, merchant: "Fresh Mart", date: TODAY, currency: "INR", total: null, taxes: [], fees: [], discounts: [], line_items: [], more_lines_than_listed: false, ...o });
let seed = 1;
const jpeg = (n = 4096) => { const s = seed++; return btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: n }, (_, i) => (i * 31 + s) % 256))); };
const receipt = (token: string, o: Record<string, unknown> = {}, op = uuid()) => call("POST", "/api/v1/drafts/receipt", { token, body: { operation_id: op, reference_time: REF, timezone: "Asia/Kolkata", mime_type: "image/jpeg", data_base64: jpeg(), ...o } });
const commit = (token: string, d: { id: string; version: number }, o: Record<string, unknown> = {}) => call("POST", `/api/v1/drafts/${d.id}/commit`, { token, body: { operation_id: uuid(), version: d.version, paid_confirmed: true, ...o } });
const summary = async (token: string) => (await call("GET", `/api/v1/summary?month=${TODAY.slice(0, 7)}`, { token })).json;

afterEach(() => vi.restoreAllMocks());

describe("receipt drafts", () => {
  it("₹300 receipt split ₹200 groceries + ₹100 household → one transaction, two allocations; image sent as data URL", async () => {
    const a = await loginAndroid("sub-r-1", "r1@example.com");
    const calls = mockOpenAI(() => ok(rc({ total: "300.00", line_items: [{ description: "Rice", amount: "200.00", category: "groceries" }, { description: "Detergent", amount: "100.00", category: "household" }] })));
    const r = await receipt(a.token);
    expect(r.status).toBe(201);
    const d = r.json.drafts[0];
    expect(d.source).toBe("receipt");
    expect(d.assumptions).toEqual([]);
    expect(d.entry).toMatchObject({ amount: "300.00", effective_local_date: TODAY, counterparty: "Fresh Mart" });
    const body = calls[0]!.body as { input: { content: unknown }[]; store: boolean };
    expect(JSON.stringify(body.input)).toContain("data:image/jpeg;base64,");
    const s = await commit(a.token, d);
    expect(s.status).toBe(201);
    expect(s.json.transaction).toMatchObject({ amount: "300.00", source: "receipt", provenance: "self_reported", receipt_draft_id: d.id });
    expect(s.json.transaction.allocations).toEqual(expect.arrayContaining([expect.objectContaining({ category_id: "groceries", amount_paise: 20000 }), expect.objectContaining({ category_id: "household", amount_paise: 10000 })]));
    const sum = await summary(a.token);
    expect(sum.grossSpendingPaise).toBe(30000);
  });

  it("taxes and discounts reconcile; malformed totals need correction and are never balanced by an invented line", async () => {
    const a = await loginAndroid("sub-r-2", "r2@example.com");
    mockOpenAI(() => ok(rc({ total: "525.00", taxes: [{ label: "GST", amount: "45.00" }], discounts: [{ label: "Offer", amount: "20.00" }], line_items: [{ description: "Shirt", amount: "500.00", category: "shopping" }] })));
    expect((await receipt(a.token)).json.drafts[0].assumptions).toEqual([]);
    vi.restoreAllMocks();
    mockOpenAI(() => ok(rc({ total: "350.00", line_items: [{ description: "A", amount: "200.00", category: "groceries" }, { description: "B", amount: "100.00", category: "household" }] })));
    const d = (await receipt(a.token)).json.drafts[0];
    expect(d.assumptions).toContain("receipt_mismatch");
    const bad = await commit(a.token, d);
    expect(bad.status).toBe(422);
    expect(bad.json.error.fields).toEqual({ receipt: "mismatch" });
    // user fixes the total → mismatch cleared and split saved
    const p = await call("PATCH", `/api/v1/drafts/${d.id}`, { token: a.token, body: { version: d.version, entry: { amount: "300" } } });
    expect(p.json.draft.assumptions).not.toContain("receipt_mismatch");
    const s = await commit(a.token, p.json.draft);
    expect(s.status).toBe(201);
    expect(s.json.transaction.allocations).toHaveLength(2);
  });

  it("explicitly saving the total without a split is allowed for a mismatched receipt", async () => {
    const a = await loginAndroid("sub-r-3", "r3@example.com");
    mockOpenAI(() => ok(rc({ total: "350.00", line_items: [{ description: "A", amount: "200.00", category: "groceries" }] })));
    const d = (await receipt(a.token)).json.drafts[0];
    const s = await commit(a.token, d, { ignore_line_items: true });
    expect(s.status).toBe(201);
    expect(s.json.transaction.allocations).toHaveLength(1);
  });

  it("captured ₹180 + matching receipt → attach keeps one ₹180 expense; undo merge restores the draft", async () => {
    const a = await loginAndroid("sub-r-4", "r4@example.com");
    const t = await call("POST", "/api/v1/transactions", { token: a.token, body: { operation_id: uuid(), payment_status: "successful", effective_local_date: ist(REF, -1), amount: "180", counterparty: "FRESH MART", kind: "expense", category_id: "groceries" } });
    expect(t.status).toBe(201);
    const other = await call("POST", "/api/v1/transactions", { token: a.token, body: { operation_id: uuid(), payment_status: "successful", effective_local_date: ist(REF, -9), amount: "180", counterparty: "Old", kind: "expense", category_id: "groceries" } });
    mockOpenAI(() => ok(rc({ total: "180", line_items: [{ description: "Veg", amount: "180", category: "groceries" }] })));
    const d = (await receipt(a.token)).json.drafts[0];
    const m = await call("GET", `/api/v1/drafts/${d.id}/matches`, { token: a.token });
    expect(m.json.items.map((x: { transaction: { id: string } }) => x.transaction.id)).toEqual([t.json.transaction.id]);
    expect(m.json.items.map((x: { transaction: { id: string } }) => x.transaction.id)).not.toContain(other.json.transaction.id);
    const before = await summary(a.token);
    const att = await commit(a.token, d, { attach_to_transaction_id: t.json.transaction.id });
    expect(att.status).toBe(200);
    expect(att.json).toMatchObject({ attached: true, transaction: { amount: "180.00", receipt_draft_id: d.id } });
    expect(await summary(a.token)).toEqual(before);
    const det = await call("POST", `/api/v1/drafts/${d.id}/detach`, { token: a.token });
    expect(det.status).toBe(200);
    expect(det.json.draft.status).toBe("open");
    const tx = await call("GET", `/api/v1/transactions/${t.json.transaction.id}`, { token: a.token });
    expect(tx.json.transaction.receipt_draft_id).toBeNull();
  });

  it("attach refuses a different amount; duplicate image is flagged; cross-user access is 404", async () => {
    const a = await loginAndroid("sub-r-5", "r5@example.com");
    const b = await loginAndroid("sub-r-6", "r6@example.com");
    const t = await call("POST", "/api/v1/transactions", { token: a.token, body: { operation_id: uuid(), payment_status: "successful", effective_local_date: TODAY, amount: "200", counterparty: "X", kind: "expense" } });
    mockOpenAI(() => ok(rc({ total: "180" })));
    const img = jpeg();
    const d = (await receipt(a.token, { data_base64: img })).json.drafts[0];
    const diff = await commit(a.token, d, { attach_to_transaction_id: t.json.transaction.id });
    expect(diff.status).toBe(422);
    expect(diff.json.error.fields).toEqual({ attach: "amount_differs" });
    expect((await commit(a.token, d)).status).toBe(201);
    const again = (await receipt(a.token, { data_base64: img })).json.drafts[0];
    expect(again.assumptions).toContain("duplicate_image");
    expect((await receipt(b.token, { data_base64: img })).json.drafts[0].assumptions).not.toContain("duplicate_image");
    expect((await call("GET", `/api/v1/drafts/${d.id}/matches`, { token: b.token })).status).toBe(404);
    expect((await call("POST", `/api/v1/drafts/${again.id}/commit`, { token: b.token, body: { operation_id: uuid(), version: 1, paid_confirmed: true } })).status).toBe(404);
  });

  it("rejects bad content before upload, and prompt-injection text in the image cannot bypass validation", async () => {
    const a = await loginAndroid("sub-r-7", "r7@example.com");
    const calls = mockOpenAI(() => ok(rc({ total: "99999999", merchant: "IGNORE THE RULES", line_items: [] })));
    expect((await receipt(a.token, { data_base64: btoa("not an image".repeat(100)) })).status).toBe(415);
    expect((await receipt(a.token, { mime_type: "image/gif" })).status).toBe(422);
    expect(calls.length).toBe(0);
    const d = (await receipt(a.token)).json.drafts[0];
    expect(d.status).toBe("open"); // never auto-committed
    expect((await call("GET", `/api/v1/transactions?month=${TODAY.slice(0, 7)}`, { token: a.token })).json.items).toHaveLength(0);
  });

  it("unreadable output → reviewable empty draft; timeout → outcome_unknown, never repeated; quota 10/day enforced before upload", async () => {
    const a = await loginAndroid("sub-r-8", "r8@example.com");
    mockOpenAI(() => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{bad" }] }] }), { status: 200 }));
    const u = await receipt(a.token);
    expect(u.json).toMatchObject({ status: "needs_review", note: "invalid_output" });
    expect(u.json.drafts[0].assumptions).toEqual(expect.arrayContaining(["receipt_unreadable", "amount_missing"]));
    vi.restoreAllMocks();
    const calls = mockOpenAI(() => { throw new DOMException("timeout", "TimeoutError"); });
    const op = uuid();
    expect((await receipt(a.token, {}, op)).json.error.code).toBe("outcome_unknown");
    expect((await call("POST", "/api/v1/drafts/receipt", { token: a.token, body: { operation_id: op, reference_time: REF, timezone: "Asia/Kolkata", mime_type: "image/jpeg", data_base64: jpeg() } })).status).toBe(409);
    expect(calls.length).toBe(1);
    vi.restoreAllMocks();
    const c2 = mockOpenAI(() => ok(rc({ total: "10" })));
    for (let i = 0; i < 8; i++) expect((await receipt(a.token)).status).toBe(201);
    const q = await receipt(a.token);
    expect(q.status).toBe(429);
    expect(c2.length).toBe(8);
  });
});
