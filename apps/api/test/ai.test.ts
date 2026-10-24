import { describe, it, expect, vi, afterEach } from "vitest";
import { call, loginAndroid, uuid, E } from "./helpers";

const day = () => new Date().toISOString().slice(0, 10);

function openaiOk(obj: unknown) {
  return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }], usage: { input_tokens: 120, output_tokens: 20 } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_test" } });
}

function mockOpenAI(handler: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const real = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.openai.com/")) return real(input, init);
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ ...body, _auth: (init?.headers as Record<string, string>)?.authorization });
    return handler(body);
  });
  return { calls, spy };
}

async function unknownTxn(token: string, counterparty: string, amount = "249.00") {
  const r = await call("POST", "/api/v1/transactions", { token, body: { operation_id: uuid(), kind: "unknown", payment_status: "successful", effective_local_date: "2026-10-10", amount, counterparty } });
  if (r.status !== 201) throw new Error(r.text);
  return r.json.transaction as { id: string; version: number };
}

const classify = (token: string, id: string, op = uuid()) => call("POST", "/api/v1/ai/classify", { token, body: { draft_id: id, operation_id: op } });

afterEach(() => vi.restoreAllMocks());

describe("AI classification (OpenAI mocked at fetch)", () => {
  it("stores a suggestion without confirming, sends minimal data with store:false, and replays without a second call", async () => {
    const a = await loginAndroid("sub-ai-1", "ai1@example.com");
    const t = await unknownTxn(a.token, "Sri Balaji Stores");
    const m = mockOpenAI(() => openaiOk({ category: "groceries", kind: "expense", reason: "Grocery store name" }));
    const op = uuid();
    const r = await classify(a.token, t.id, op);
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("succeeded");
    expect(r.json.suggestion.category).toBe("groceries");
    expect(m.calls.length).toBe(1);
    const sent = m.calls[0]!;
    expect(sent.store).toBe(false);
    expect(sent._auth).toBe("Bearer sk-test-not-a-real-key");
    expect(JSON.stringify(sent.input)).not.toMatch(/UPI Ref|@ok|@ybl/);
    expect((sent.text as { format: { type: string; strict: boolean } }).format).toMatchObject({ type: "json_schema", strict: true });
    const g = await call("GET", `/api/v1/transactions/${t.id}`, { token: a.token });
    expect(g.json.transaction.review_state).toBe("needs_review");
    expect(g.json.transaction.kind).toBe("unknown");
    expect(g.json.transaction.suggestion).toMatchObject({ category_id: "groceries", kind: "expense" });
    const replay = await classify(a.token, t.id, op);
    expect(replay.json.replayed ?? replay.json.cached).toBeTruthy();
    expect(m.calls.length).toBe(1);
    const t2 = await unknownTxn(a.token, "Another Shop");
    const reuse = await classify(a.token, t2.id, op);
    expect(reuse.status).toBe(409);
    expect(reuse.json.error.code).toBe("conflict");
    const ops = await call("GET", `/api/v1/operations/${op}`, { token: a.token });
    expect(ops.json.operation.status).toBe("succeeded");
    // Accepting the suggestion is an explicit user edit; it clears the suggestion.
    const acc = await call("PATCH", `/api/v1/transactions/${t.id}`, { token: a.token, body: { version: g.json.transaction.version, kind: "expense", category_id: "groceries", review_state: "confirmed" } });
    expect(acc.status).toBe(200);
    expect(acc.json.transaction.suggestion).toBeNull();
    expect((await classify(a.token, t.id)).json.status).toBe("skipped");
  });

  it("uses a saved user rule before AI and never calls the provider", async () => {
    const a = await loginAndroid("sub-ai-2", "ai2@example.com");
    expect((await call("POST", "/api/v1/category-rules", { token: a.token, body: { counterparty: "Green Leaf Cafe", category_id: "food_drinks", kind: "expense" } })).status).toBe(201);
    const t = await unknownTxn(a.token, "Green Leaf Cafe");
    const m = mockOpenAI(() => openaiOk({ category: "shopping", kind: "expense", reason: "x" }));
    const r = await classify(a.token, t.id);
    expect(r.json.suggestion).toMatchObject({ category: "food_drinks", model: "rule" });
    expect(m.calls.length).toBe(0);
  });

  it("invalid category, refusal and incomplete outputs leave the record in review", async () => {
    const a = await loginAndroid("sub-ai-3", "ai3@example.com");
    // Factories: Workers I/O objects must be created inside the request that returns them.
    const replies = [
      () => openaiOk({ category: "luxury", kind: "expense", reason: "made up" }),
      () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }), { status: 200 }),
      () => new Response(JSON.stringify({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }), { status: 200 }),
    ];
    let i = 0;
    mockOpenAI(() => replies[i++]!());
    for (const reason of ["invalid_output", "refusal", "incomplete"]) {
      const t = await unknownTxn(a.token, `Shop ${reason}`);
      const r = await classify(a.token, t.id);
      expect(r.json).toMatchObject({ status: "needs_review", reason });
      const g = await call("GET", `/api/v1/transactions/${t.id}`, { token: a.token });
      expect(g.json.transaction.suggestion).toBeNull();
      expect(g.json.transaction.review_state).toBe("needs_review");
    }
  });

  it("timeout marks outcome_unknown and a retry of the same operation does not call the provider again", async () => {
    const a = await loginAndroid("sub-ai-4", "ai4@example.com");
    const t = await unknownTxn(a.token, "Slow Merchant");
    const m = mockOpenAI(() => { throw new DOMException("timed out", "TimeoutError"); });
    const op = uuid();
    const r = await classify(a.token, t.id, op);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("outcome_unknown");
    const again = await classify(a.token, t.id, op);
    expect(again.json.error.code).toBe("outcome_unknown");
    expect(m.calls.length).toBe(1);
    const used = await E.DB.prepare("SELECT count FROM usage_counters WHERE user_id = ? AND day = ? AND metric = 'classify'").bind(a.userId, day()).first();
    expect(used?.count).toBe(1); // uncertain outcome counted conservatively
  });

  it("exhausted provider credits → 503 retryable; captured record stays in review", async () => {
    const a = await loginAndroid("sub-ai-5", "ai5@example.com");
    const t = await unknownTxn(a.token, "Credit Shop");
    mockOpenAI(() => new Response(JSON.stringify({ error: { code: "insufficient_quota", type: "insufficient_quota" } }), { status: 429 }));
    const r = await classify(a.token, t.id);
    expect(r.status).toBe(503);
    expect(r.json.error).toMatchObject({ code: "upstream_unavailable", retryable: true });
    expect(r.headers.get("retry-after")).toBe("3600");
    const g = await call("GET", `/api/v1/transactions/${t.id}`, { token: a.token });
    expect(g.json.transaction.review_state).toBe("needs_review");
  });

  it("user and global quotas deny before any upstream call; denied global reservation rolls back the user slot", async () => {
    const a = await loginAndroid("sub-ai-6", "ai6@example.com");
    const t = await unknownTxn(a.token, "Quota Shop");
    const m = mockOpenAI(() => openaiOk({ category: "shopping", kind: "expense", reason: "x" }));
    await E.DB.prepare("INSERT INTO usage_counters (user_id, day, metric, count) VALUES (?,?,'classify',50)").bind(a.userId, day()).run();
    const op = uuid();
    const r = await classify(a.token, t.id, op);
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe("quota_exceeded");
    expect(m.calls.length).toBe(0);

    await E.DB.prepare("UPDATE usage_counters SET count = 10 WHERE user_id = ? AND day = ? AND metric = 'classify'").bind(a.userId, day()).run();
    const before = await E.DB.prepare("SELECT count FROM global_counters WHERE day = ? AND metric = 'ai_calls'").bind(day()).first();
    await E.DB.prepare("INSERT INTO global_counters (day, metric, count) VALUES (?, 'ai_calls', 100) ON CONFLICT(day, metric) DO UPDATE SET count = 100").bind(day()).run();
    const g = await classify(a.token, t.id, op); // same operation re-claimable: no upstream call was made
    expect(g.status).toBe(429);
    expect(m.calls.length).toBe(0);
    const u = await E.DB.prepare("SELECT count FROM usage_counters WHERE user_id = ? AND day = ? AND metric = 'classify'").bind(a.userId, day()).first();
    expect(u?.count).toBe(10);
    await E.DB.prepare("UPDATE global_counters SET count = ? WHERE day = ? AND metric = 'ai_calls'").bind(before?.count ?? 0, day()).run();
    const ok = await classify(a.token, t.id, op); // quota freed → same operation proceeds once
    expect(ok.json.status).toBe("succeeded");
    expect(m.calls.length).toBe(1);
  });

  it("concurrent requests cannot exceed the user quota", async () => {
    const a = await loginAndroid("sub-ai-7", "ai7@example.com");
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push((await unknownTxn(a.token, `Parallel Shop ${i}`)).id);
    const m = mockOpenAI(() => openaiOk({ category: "shopping", kind: "expense", reason: "x" }));
    await E.DB.prepare("INSERT INTO usage_counters (user_id, day, metric, count) VALUES (?,?,'classify',47)").bind(a.userId, day()).run();
    const rs = await Promise.all(ids.map((id) => classify(a.token, id)));
    expect(rs.filter((r) => r.status === 200).length).toBe(3);
    expect(rs.filter((r) => r.status === 429).length).toBe(5);
    expect(m.calls.length).toBe(3);
    const u = await E.DB.prepare("SELECT count FROM usage_counters WHERE user_id = ? AND day = ? AND metric = 'classify'").bind(a.userId, day()).first();
    expect(u?.count).toBe(50);
  });

  it("cannot classify another user's transaction; AI-disabled users are skipped", async () => {
    const a = await loginAndroid("sub-ai-8", "ai8@example.com");
    const b = await loginAndroid("sub-ai-9", "ai9@example.com");
    const t = await unknownTxn(a.token, "Private Shop");
    const m = mockOpenAI(() => openaiOk({ category: "shopping", kind: "expense", reason: "x" }));
    expect((await classify(b.token, t.id)).status).toBe(404);
    expect((await call("PATCH", "/api/v1/settings", { token: a.token, body: { ai_processing: false } })).status).toBe(200);
    expect((await classify(a.token, t.id)).json).toMatchObject({ status: "skipped", reason: "ai_disabled" });
    expect(m.calls.length).toBe(0);
  });
});
