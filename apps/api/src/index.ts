import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppVars } from "./env";
import { ApiError, errorResponse, uuid, now, parseJson } from "./util";
import { authRoutes, logoutRoute, requireAuth } from "./auth";
import { ledger } from "./ledger";
import { ingest } from "./ingest";
import { ai } from "./ai";
import { SettingsPatch } from "@tinkerspend/contracts";
import { isValidTimeZone } from "@tinkerspend/domain";

const app = new Hono<AppVars>();

app.use("*", async (c, next) => {
  c.set("requestId", uuid());
  await next();
});
app.use("/api/*", secureHeaders({ contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] }, crossOriginResourcePolicy: "same-origin" }));
app.use("/api/*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); });

app.onError((err, c) => {
  if (err instanceof ApiError) return errorResponse(c, err);
  console.error(JSON.stringify({ level: "error", request_id: c.get("requestId"), path: new URL(c.req.url).pathname, error: err instanceof Error ? err.name : "unknown" }));
  const msg = String(err);
  if (/D1_ERROR|too many requests|limit/i.test(msg)) return errorResponse(c, new ApiError(503, "service_unavailable", "Storage temporarily unavailable; retry later", true, 60));
  return errorResponse(c, new ApiError(500, "internal", "Internal error", true));
});
app.notFound((c) => (new URL(c.req.url).pathname.startsWith("/api/") ? errorResponse(c, new ApiError(404, "not_found", "Not found")) : c.text("Not found", 404)));

const api = new Hono<AppVars>();
api.get("/health", async (c) => {
  const t0 = now();
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ ok: true, env: c.env.APP_ENV, d1_ms: now() - t0 });
});
api.route("/auth", authRoutes);
api.route("/auth/logout", logoutRoute);
api.use("*", async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p === "/api/v1/health" || (p.startsWith("/api/v1/auth/") && !p.startsWith("/api/v1/auth/logout"))) return next();
  return requireAuth(c, next);
});
api.get("/me", (c) => c.json({ user: { id: c.get("user").id, email: c.get("user").email, timezone: c.get("user").timezone, ai_enabled: c.get("user").aiEnabled, client: c.get("user").client } }));
api.patch("/settings", async (c) => {
  const b = await parseJson(c, SettingsPatch, 2048);
  const u = c.get("user");
  if (b.timezone && !isValidTimeZone(b.timezone)) throw new ApiError(422, "validation_failed", "Unknown timezone", false, undefined, { timezone: "invalid" });
  if (b.timezone) await c.env.DB.prepare("UPDATE users SET timezone = ? WHERE id = ?").bind(b.timezone, u.id).run();
  if (b.ai_processing !== undefined) await c.env.DB.prepare("UPDATE users SET ai_enabled = ? WHERE id = ?").bind(b.ai_processing ? 1 : 0, u.id).run();
  return c.json({ ok: true });
});
api.get("/devices", async (c) => {
  const rs = await c.env.DB.prepare("SELECT id, label, created_at, last_seen_at, revoked_at FROM devices WHERE user_id = ? ORDER BY created_at DESC").bind(c.get("user").id).all();
  return c.json({ items: rs.results });
});
api.delete("/devices/:id", async (c) => {
  const u = c.get("user");
  const r = await c.env.DB.prepare("UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL").bind(now(), c.req.param("id"), u.id).run();
  if (!r.meta.changes) throw new ApiError(404, "not_found", "Device not found");
  await c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE device_id = ? AND user_id = ?").bind(now(), c.req.param("id"), u.id).run();
  return c.json({ ok: true });
});
api.delete("/account", async (c) => {
  const u = c.get("user");
  const tables = ["allocations", "txn_refs", "source_events", "drafts", "category_rules", "operations", "ai_operations", "txn_suggestions", "usage_counters", "transactions", "sessions", "devices"];
  await c.env.DB.batch([
    ...tables.map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(u.id)),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
  ]);
  return c.json({ ok: true });
});
api.route("/", ledger);
api.route("/", ingest);
api.route("/", ai);

app.route("/api/v1", api);

export default {
  fetch(req: Request, env: AppVars["Bindings"], ctx: ExecutionContext) {
    // HttpURLConnection cannot send PATCH; accept a narrow override for the API only.
    if (req.method === "POST" && req.headers.get("x-http-method-override") === "PATCH" && new URL(req.url).pathname.startsWith("/api/v1/")) {
      req = new Request(req, { method: "PATCH" });
    }
    return app.fetch(req, env, ctx);
  },
};
export { app };
