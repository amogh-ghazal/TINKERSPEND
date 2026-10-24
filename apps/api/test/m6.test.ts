import { describe, it, expect, vi, afterEach } from "vitest";
import { call, loginAndroid, uuid, E } from "./helpers";

const REF = Date.now() - 3600_000;
afterEach(() => vi.restoreAllMocks());

function mockOpenAI(handler: () => Response | Promise<Response>) {
  const real = globalThis.fetch;
  let n = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.openai.com/")) return real(input, init);
    n++; return handler();
  });
  return () => n;
}

describe("M6 reliability and privacy", () => {
  it("concurrent saves of one draft with the same operation create exactly one transaction", async () => {
    const a = await loginAndroid("sub-m6-1", "m61@example.com");
    await call("PATCH", "/api/v1/settings", { token: a.token, body: { ai_processing: false } });
    const d = (await call("POST", "/api/v1/drafts/text", { token: a.token, body: { operation_id: uuid(), text: "lunch 180", reference_time: REF, timezone: "Asia/Kolkata" } })).json.drafts[0];
    const op = uuid();
    const rs = await Promise.all(Array.from({ length: 5 }, () => call("POST", `/api/v1/drafts/${d.id}/commit`, { token: a.token, body: { operation_id: op, version: d.version, paid_confirmed: true } })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.every((r) => [200, 201, 409].includes(r.status))).toBe(true);
    const n = await E.DB.prepare("SELECT COUNT(*) AS n FROM transactions WHERE user_id = (SELECT user_id FROM drafts WHERE id = ?)").bind(d.id).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("exhausted OpenAI credits on typed entry fall back to drafts without losing input; no retry loop", async () => {
    const a = await loginAndroid("sub-m6-2", "m62@example.com");
    const count = mockOpenAI(() => new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 }));
    const r = await call("POST", "/api/v1/drafts/text", { token: a.token, body: { operation_id: uuid(), text: "auto 80", reference_time: REF, timezone: "Asia/Kolkata" } });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ method: "deterministic", note: "provider_credits_exhausted" });
    expect(r.json.drafts[0].entry.amount).toBe("80.00");
    expect(count()).toBe(1);
  });

  it("logout revokes the session; account deletion removes drafts, receipt links, AI rows and sessions", async () => {
    const a = await loginAndroid("sub-m6-3", "m63@example.com");
    await call("POST", "/api/v1/drafts/text", { token: a.token, body: { operation_id: uuid(), text: "lunch 180", reference_time: REF, timezone: "Asia/Kolkata" } });
    const uid = (await E.DB.prepare("SELECT id FROM users WHERE email = ?").bind("m63@example.com").first<{ id: string }>())!.id;
    const del = await call("DELETE", "/api/v1/account", { token: a.token });
    expect(del.status).toBe(200);
    for (const t of ["drafts", "receipt_links", "ai_operations", "txn_suggestions", "transactions", "sessions", "usage_counters"]) {
      const n = await E.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).bind(uid).first<{ n: number }>();
      expect([t, n!.n]).toEqual([t, 0]);
    }
    expect((await call("GET", "/api/v1/drafts", { token: a.token })).status).toBe(401);
    const b = await loginAndroid("sub-m6-4", "m64@example.com");
    expect((await call("POST", "/api/v1/auth/logout", { token: b.token, body: {} })).status).toBe(200);
    expect((await call("GET", "/api/v1/transactions?month=2026-10", { token: b.token })).status).toBe(401);
  });
});
