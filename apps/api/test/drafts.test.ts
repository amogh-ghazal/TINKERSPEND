import { describe, it, expect, vi, afterEach } from "vitest";
import { call, loginAndroid, uuid, E } from "./helpers";

// 2026-10-24 23:30 IST (18:00 UTC): "yesterday" must be Oct 23 in Asia/Kolkata.
const REF = Date.now() - 3600_000;
const ist = (ms: number, days = 0) => new Date(ms + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

function mockOpenAI(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.openai.com/")) return real(input, init);
    calls.push(url);
    return handler(url, init);
  });
  return calls;
}
const responsesOk = (obj: unknown) => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }], usage: { input_tokens: 300, output_tokens: 60 } }), { status: 200 });
const exp = (o: Record<string, unknown>) => ({ amount: null, currency: "INR", date_phrase: null, description: null, counterparty: null, category: "uncategorized", kind: "expense", ...o });
const text = (token: string, t: string, op = uuid(), ref = REF) => call("POST", "/api/v1/drafts/text", { token, body: { operation_id: op, text: t, reference_time: ref, timezone: "Asia/Kolkata" } });
const audio = (n = 2048) => btoa(String.fromCharCode(...Array.from({ length: n }, (_, i) => (i * 37) % 256)));
const voice = (token: string, op = uuid(), o: Record<string, unknown> = {}) => call("POST", "/api/v1/drafts/voice", { token, body: { operation_id: op, reference_time: REF, timezone: "Asia/Kolkata", mime_type: "audio/mp4", data_base64: audio(), duration_ms: 4000, ...o } });

afterEach(() => vi.restoreAllMocks());

describe("text drafts", () => {
  it("deterministic path (AI off): two drafts, relative date from reference time, explicit confirmed save, idempotent commit", async () => {
    const a = await loginAndroid("sub-d-1", "d1@example.com");
    await call("PATCH", "/api/v1/settings", { token: a.token, body: { ai_processing: false } });
    const calls = mockOpenAI(() => responsesOk({ expenses: [] }));
    const r = await text(a.token, "Yesterday, lunch 180 and auto 80.");
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ method: "deterministic", note: "ai_disabled" });
    expect(calls.length).toBe(0);
    const [d1, d2] = r.json.drafts;
    expect([d1.entry.amount, d1.entry.effective_local_date, d1.entry.category_id]).toEqual(["180.00", ist(REF, -1), "food_drinks"]);
    expect([d2.entry.amount, d2.entry.category_id]).toEqual(["80.00", "transport"]);
    expect(d1.input_text).toBe("Yesterday, lunch 180 and auto 80.");
    // nothing is committed until Save
    expect((await call("GET", "/api/v1/transactions?month=" + ist(REF, -1).slice(0, 7), { token: a.token })).json.items).toHaveLength(0);
    const op = uuid();
    const noConfirm = await call("POST", `/api/v1/drafts/${d1.id}/commit`, { token: a.token, body: { operation_id: op, version: d1.version, paid_confirmed: false } });
    expect(noConfirm.status).toBe(422);
    expect(noConfirm.json.error.fields).toMatchObject({ paid_confirmed: "confirm_paid" });
    const ok = await call("POST", `/api/v1/drafts/${d1.id}/commit`, { token: a.token, body: { operation_id: op, version: d1.version, paid_confirmed: true } });
    expect(ok.status).toBe(201);
    expect(ok.json.transaction).toMatchObject({ amount: "180.00", source: "text", provenance: "self_reported", kind: "expense", effective_local_date: ist(REF, -1) });
    const again = await call("POST", `/api/v1/drafts/${d1.id}/commit`, { token: a.token, body: { operation_id: op, version: d1.version, paid_confirmed: true } });
    expect(again.json.replayed).toBe(true);
    const list = await call("GET", "/api/v1/drafts", { token: a.token });
    expect(list.json.items.map((x: { id: string }) => x.id)).toEqual([d2.id]);
    const row = await E.DB.prepare("SELECT payload FROM drafts WHERE id = ?").bind(d1.id).first<{ payload: string }>();
    expect(JSON.parse(row!.payload).input_text).toBeUndefined(); // source text not retained after save
    expect((await call("POST", `/api/v1/drafts/${d2.id}/discard`, { token: a.token })).status).toBe(200);
    const row2 = await E.DB.prepare("SELECT status, payload FROM drafts WHERE id = ?").bind(d2.id).first<{ status: string; payload: string }>();
    expect(row2!.status).toBe("ignored");
    expect(JSON.parse(row2!.payload).input_text).toBeNull();
  });

  it("AI path: amount not present in the text is dropped, date phrase resolved server-side, store:false", async () => {
    const a = await loginAndroid("sub-d-2", "d2@example.com");
    let sent: Record<string, unknown> = {};
    mockOpenAI((_u, init) => { sent = JSON.parse(String(init?.body)); return responsesOk({ expenses: [exp({ amount: "250", date_phrase: "yesterday", description: "auto", category: "transport" }), exp({ amount: "999", description: "tea", category: "food_drinks" })] }); });
    const r = await text(a.token, "yesterday auto not 150, it was 250, and some tea");
    expect(r.json.method).toBe("ai");
    expect(sent.store).toBe(false);
    const [auto, tea] = r.json.drafts;
    expect(auto.entry).toMatchObject({ amount: "250.00", effective_local_date: ist(REF, -1), category_id: "transport" });
    expect(tea.entry.amount).toBeNull();
    expect(tea.assumptions).toContain("amount_not_in_source");
    expect(tea.assumptions).toContain("date_assumed_reference_day");
    // Editing the amount clears the amount warning; stale version is rejected.
    const p = await call("PATCH", `/api/v1/drafts/${tea.id}`, { token: a.token, body: { version: tea.version, entry: { amount: "20" } } });
    expect(p.status).toBe(200);
    expect(p.json.draft.assumptions).not.toContain("amount_not_in_source");
    expect((await call("PATCH", `/api/v1/drafts/${tea.id}`, { token: a.token, body: { version: tea.version, entry: { amount: "30" } } })).status).toBe(409);
    const b = await loginAndroid("sub-d-3", "d3@example.com");
    expect((await call("PATCH", `/api/v1/drafts/${tea.id}`, { token: b.token, body: { version: 2, entry: { amount: "30" } } })).status).toBe(404);
    expect((await call("POST", `/api/v1/drafts/${tea.id}/commit`, { token: b.token, body: { operation_id: uuid(), version: 2, paid_confirmed: true } })).status).toBe(404);
  });

  it("timeout → outcome_unknown with deterministic drafts kept; replay returns them without another provider call", async () => {
    const a = await loginAndroid("sub-d-4", "d4@example.com");
    const calls = mockOpenAI(() => { throw new DOMException("timeout", "TimeoutError"); });
    const op = uuid();
    const r = await text(a.token, "coffee 120", op);
    expect(r.json).toMatchObject({ status: "outcome_unknown", method: "deterministic" });
    expect(r.json.drafts[0].entry.amount).toBe("120.00");
    const again = await text(a.token, "coffee 120", op);
    expect(again.json.replayed).toBe(true);
    expect(again.json.drafts[0].id).toBe(r.json.drafts[0].id);
    expect(calls.length).toBe(1);
    expect((await text(a.token, "coffee 130", op)).status).toBe(409); // same op, different input
  });

  it("rejects a reference time outside the capture window", async () => {
    const a = await loginAndroid("sub-d-5", "d5@example.com");
    expect((await text(a.token, "coffee 120", uuid(), Date.now() - 40 * 86_400_000)).status).toBe(422);
  });
});

describe("SuperMoney share and contextual replies", () => {
  it("creates a synthetic payment draft without AI and links a typed purpose to that draft", async () => {
    const owner = await loginAndroid("sub-supermoney-1", "demo1@example.com");
    const calls = mockOpenAI(() => responsesOk({ expenses: [] }));
    const referenceTime = Date.now();
    const created = await call("POST", "/api/v1/drafts/demo-payment", { token: owner.token, body: { operation_id: uuid(), reference_time: referenceTime, timezone: "Asia/Kolkata" } });
    expect(created.status).toBe(201);
    const original = created.json.drafts[0];
    expect(original).toMatchObject({ demo: true, entry: { amount: "3500.00", counterparty: "Vineesh (demo)", category_id: "uncategorized" } });
    const linked = await call("POST", "/api/v1/drafts/text", { token: owner.token, body: { operation_id: uuid(), text: "Dinner with friends", reference_time: Date.now(), timezone: "Asia/Kolkata", reply_to_draft_id: original.id } });
    expect(linked.status).toBe(200);
    expect(linked.json).toMatchObject({ method: "linked", drafts: [{ id: original.id, purpose_note: "Dinner with friends", entry: { amount: "3500.00", description: "Dinner with friends", category_id: "food_drinks" } }] });
    expect(calls).toHaveLength(0);
    expect((await call("GET", "/api/v1/transactions?month=" + linked.json.drafts[0].entry.effective_local_date.slice(0, 7), { token: owner.token })).json.items).toHaveLength(0);
  });

  it("rejects stale or cross-account contextual replies", async () => {
    const owner = await loginAndroid("sub-supermoney-2", "demo2@example.com");
    const other = await loginAndroid("sub-supermoney-3", "demo3@example.com");
    const created = await call("POST", "/api/v1/drafts/demo-payment", { token: owner.token, body: { operation_id: uuid(), reference_time: Date.now(), timezone: "Asia/Kolkata" } });
    const draftId = created.json.drafts[0].id;
    const foreign = await call("POST", "/api/v1/drafts/text", { token: other.token, body: { operation_id: uuid(), text: "Dinner", reference_time: Date.now(), timezone: "Asia/Kolkata", reply_to_draft_id: draftId } });
    expect(foreign.status).toBe(404);
    const late = await call("POST", "/api/v1/drafts/text", { token: owner.token, body: { operation_id: uuid(), text: "Dinner", reference_time: created.json.drafts[0].created_at + 31_000, timezone: "Asia/Kolkata", reply_to_draft_id: draftId } });
    expect(late.status).toBe(409);
    expect(late.json.error.message).toContain("30-second");
  });

  it("transcribes a voice reply but skips a second expense extraction call", async () => {
    const owner = await loginAndroid("sub-supermoney-4", "demo4@example.com");
    const created = await call("POST", "/api/v1/drafts/demo-payment", { token: owner.token, body: { operation_id: uuid(), reference_time: Date.now(), timezone: "Asia/Kolkata" } });
    const target = created.json.drafts[0];
    const real = globalThis.fetch;
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("https://api.openai.com/")) return real(input, init);
      calls.push(url);
      return new Response(JSON.stringify({ text: "Dinner with friends", usage: { seconds: 2 } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "mock-transcription" } });
    });
    const linked = await voice(owner.token, uuid(), { reply_to_draft_id: target.id, reference_time: Date.now() });
    expect(linked.status).toBe(200);
    expect(linked.json).toMatchObject({ method: "linked", transcript: "Dinner with friends", drafts: [{ id: target.id, entry: { category_id: "food_drinks" } }] });
    expect(calls).toEqual(["https://api.openai.com/v1/audio/transcriptions"]);
  });
});

describe("voice drafts", () => {
  it("validates spoken amounts independently and rejects balance digits or invented amounts", async () => {
    const a = await loginAndroid("sub-v-words", "vwords@example.com");
    mockOpenAI((url) => url.endsWith("/audio/transcriptions")
      ? Response.json({ text: "Lunch two hundred fifty, balance Rs 4321, and some tea" })
      : responsesOk({ expenses: [exp({ amount: "250", description: "lunch" }), exp({ amount: "4321", description: "tea" }), exp({ amount: "900", description: "snacks" })] }));
    const r = await voice(a.token);
    expect(r.status).toBe(201);
    expect(r.json.drafts.map((d: { entry: { amount: string | null } }) => d.entry.amount)).toEqual(["250.00", null, null]);
    expect(r.json.drafts[1].assumptions).toContain("amount_not_in_source");
    expect(r.json.drafts[2].assumptions).toContain("amount_not_in_source");
  });
  it("transcribes then extracts; transcript returned and editable; nothing committed", async () => {
    const a = await loginAndroid("sub-v-1", "v1@example.com");
    let form: FormData | null = null;
    const calls = mockOpenAI(async (url, init) => {
      if (url.endsWith("/audio/transcriptions")) { form = init?.body as FormData; return Response.json({ text: "Yesterday lunch 180 and auto 80." }); }
      return responsesOk({ expenses: [exp({ amount: "180", date_phrase: "yesterday", description: "lunch", category: "food_drinks" }), exp({ amount: "80", date_phrase: "yesterday", description: "auto", category: "transport" })] });
    });
    const r = await voice(a.token);
    expect(r.status).toBe(201);
    expect(r.json.transcript).toBe("Yesterday lunch 180 and auto 80.");
    expect(r.json.drafts).toHaveLength(2);
    expect(r.json.drafts[0]).toMatchObject({ source: "voice", transcript: "Yesterday lunch 180 and auto 80." });
    expect(calls).toEqual(["https://api.openai.com/v1/audio/transcriptions", "https://api.openai.com/v1/responses"]);
    expect((form as FormData | null)?.get("model")).toBe("gpt-4o-mini-transcribe");
    expect((form as FormData | null)?.get("language")).toBe("en");
    const m = ist(REF, -1).slice(0, 7);
    expect((await call("GET", `/api/v1/transactions?month=${m}`, { token: a.token })).json.items).toHaveLength(0);
  });

  it("validates format, size and AI setting before any upload", async () => {
    const a = await loginAndroid("sub-v-2", "v2@example.com");
    const calls = mockOpenAI(() => Response.json({ text: "x" }));
    expect((await voice(a.token, uuid(), { mime_type: "video/mp4" })).status).toBe(415);
    expect((await voice(a.token, uuid(), { duration_ms: 61_000 })).status).toBe(422);
    expect((await voice(a.token, uuid(), { data_base64: audio(10) })).status).toBe(422);
    await call("PATCH", "/api/v1/settings", { token: a.token, body: { ai_processing: false } });
    expect((await voice(a.token)).json.error.fields).toMatchObject({ reason: "ai_disabled" });
    expect(calls.length).toBe(0);
  });

  it("timeout → outcome_unknown, never retried for the same operation; quota denial happens before upload", async () => {
    const a = await loginAndroid("sub-v-3", "v3@example.com");
    const calls = mockOpenAI(() => { throw new DOMException("timeout", "TimeoutError"); });
    const op = uuid();
    const r = await voice(a.token, op);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("outcome_unknown");
    expect((await voice(a.token, op)).json.error.code).toBe("outcome_unknown");
    expect(calls.length).toBe(1);
    const day = new Date().toISOString().slice(0, 10);
    await E.DB.prepare("INSERT INTO usage_counters (user_id, day, metric, count) VALUES (?,?,'voice',20) ON CONFLICT(user_id, day, metric) DO UPDATE SET count = 20").bind(a.userId, day).run();
    const q = await voice(a.token);
    expect(q.status).toBe(429);
    expect(calls.length).toBe(1);
  });

  it("exhausted credits → 503 retryable", async () => {
    const a = await loginAndroid("sub-v-4", "v4@example.com");
    mockOpenAI(() => new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 }));
    const r = await voice(a.token);
    expect(r.status).toBe(503);
    expect(r.json.error.retryable).toBe(true);
  });
});
