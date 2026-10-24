import { Hono, type MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { ChallengeRequest, GoogleLoginRequest } from "@tinkerspend/contracts";
import { DEFAULT_TIMEZONE } from "@tinkerspend/domain";
import type { AppVars, AuthedUser, Env } from "./env";
import { ApiError, now, parseJson, randomToken, sha256Hex, uuid } from "./util";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SESSION_COOKIE = "__Host-ts_session";
export const CSRF_COOKIE = "__Host-ts_csrf";

export interface VerifiedIdentity { sub: string; email: string; emailVerified: boolean; name?: string; nonce?: string }

export async function verifyGoogleIdToken(env: Env, token: string): Promise<VerifiedIdentity> {
  if (env.TEST_ID_TOKEN_VERIFIER === "insecure-test-only" && env.APP_ENV === "test") {
    // Test harness: token is base64url JSON of claims. Unreachable unless APP_ENV=test.
    const claims = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    if (claims.aud !== env.GOOGLE_WEB_CLIENT_ID || claims.iss !== "https://accounts.google.com" || Number(claims.exp) * 1000 < now()) throw new ApiError(401, "unauthenticated", "Invalid identity token");
    return { sub: String(claims.sub), email: String(claims.email), emailVerified: claims.email_verified === true, name: claims.name as string | undefined, nonce: claims.nonce as string | undefined };
  }
  if (!env.GOOGLE_WEB_CLIENT_ID) throw new ApiError(503, "service_unavailable", "Sign-in not configured");
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_WEB_CLIENT_ID,
      clockTolerance: 60,
    }));
  } catch {
    throw new ApiError(401, "unauthenticated", "Invalid identity token");
  }
  return { sub: String(payload.sub), email: String(payload.email ?? ""), emailVerified: payload.email_verified === true, name: payload.name as string | undefined, nonce: payload.nonce as string | undefined };
}

export const authRoutes = new Hono<AppVars>();

authRoutes.post("/challenge", async (c) => {
  const body = await parseJson(c, ChallengeRequest, 2048);
  // Bound unauthenticated writes on the Free tier. No IP address or identity is stored for this counter.
  const day = new Date().toISOString().slice(0, 10);
  const configured = Number(c.env.AUTH_CHALLENGE_DAILY_LIMIT ?? "1000");
  const limit = Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 1000) : 1000;
  const slot = await c.env.DB.prepare(`INSERT INTO global_counters (day,metric,count) VALUES (?,'auth_challenge',1)
    ON CONFLICT(day,metric) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`).bind(day, limit).first();
  if (!slot) throw new ApiError(429, "quota_exceeded", "Sign-in request limit reached; existing signed-in sessions still work", true,
    Math.max(60, Math.ceil((Date.parse(day + "T00:00:00Z") + 86_400_000 - now()) / 1000)));
  const id = uuid();
  const nonce = randomToken(24);
  await c.env.DB.prepare("INSERT INTO auth_challenges (id, nonce_hash, client, install_id, expires_at) VALUES (?,?,?,?,?)")
    .bind(id, await sha256Hex(nonce), body.client, body.install_id ?? null, now() + CHALLENGE_TTL_MS).run();
  // Opportunistic cleanup keeps the table small on D1 Free.
  await c.env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now() - 3600_000).run();
  return c.json({ challenge_id: id, nonce, expires_at: now() + CHALLENGE_TTL_MS });
});

authRoutes.post("/google", async (c) => {
  const body = await parseJson(c, GoogleLoginRequest, 8192);
  const ident = await verifyGoogleIdToken(c.env, body.id_token);
  if (!ident.nonce) throw new ApiError(401, "unauthenticated", "Missing nonce");
  // Single-use: atomically consume the challenge whose nonce matches.
  const consumed = await c.env.DB.prepare(
    "UPDATE auth_challenges SET used_at = ? WHERE id = ? AND nonce_hash = ? AND client = ? AND used_at IS NULL AND expires_at > ? RETURNING install_id",
  ).bind(now(), body.challenge_id, await sha256Hex(ident.nonce), body.client, now()).first<{ install_id: string | null }>();
  if (!consumed) throw new ApiError(401, "unauthenticated", "Challenge expired, reused or mismatched");
  if (body.client === "android" && consumed.install_id !== (body.install_id ?? null)) throw new ApiError(401, "unauthenticated", "Challenge bound to another install");
  if (!ident.emailVerified || !ident.email) throw new ApiError(403, "forbidden", "Google email not verified");
  const email = ident.email.toLowerCase();
  const allowed = await c.env.DB.prepare("SELECT 1 FROM allowlist WHERE email = ?").bind(email).first();
  if (!allowed) throw new ApiError(403, "not_allowlisted", "This Google account is not on the tester allowlist");

  let user = await c.env.DB.prepare("SELECT id, timezone FROM users WHERE google_sub = ? AND deleted_at IS NULL").bind(ident.sub).first<{ id: string; timezone: string }>();
  if (!user) {
    user = { id: uuid(), timezone: DEFAULT_TIMEZONE };
    await c.env.DB.prepare("INSERT INTO users (id, google_sub, email, name, timezone, created_at) VALUES (?,?,?,?,?,?)")
      .bind(user.id, ident.sub, email, ident.name ?? null, user.timezone, now()).run();
  }
  let deviceId: string | null = null;
  if (body.client === "android" && body.install_id) {
    const dev = await c.env.DB.prepare(
      "INSERT INTO devices (id, user_id, install_id, label, created_at, last_seen_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id, install_id) DO UPDATE SET revoked_at = NULL, last_seen_at = excluded.last_seen_at, label = excluded.label RETURNING id",
    ).bind(uuid(), user.id, body.install_id, body.device_label ?? null, now(), now()).first<{ id: string }>();
    deviceId = dev!.id;
  }
  const token = randomToken(32);
  const days = Number(c.env.SESSION_DAYS || "30");
  const expiresAt = now() + (body.client === "web" ? Math.min(days, 14) : days) * 86400_000;
  const csrf = body.client === "web" ? randomToken(24) : null;
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, device_id, client, csrf_hash, created_at, expires_at) VALUES (?,?,?,?,?,?,?)")
    .bind(await sha256Hex(token), user.id, deviceId, body.client, csrf ? await sha256Hex(csrf) : null, now(), expiresAt).run();
  const userOut = { id: user.id, email, timezone: user.timezone };
  if (body.client === "web") {
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", expires: new Date(expiresAt) });
    setCookie(c, CSRF_COOKIE, csrf!, { httpOnly: false, secure: true, sameSite: "Strict", path: "/", expires: new Date(expiresAt) });
    return c.json({ user: userOut, expires_at: expiresAt });
  }
  return c.json({ user: userOut, token, expires_at: expiresAt, device_id: deviceId });
});

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireAuth: MiddlewareHandler<AppVars> = async (c, next) => {
  const bearer = c.req.header("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,128})$/)?.[1];
  const cookie = getCookie(c, SESSION_COOKIE);
  const token = bearer ?? cookie;
  if (!token) throw new ApiError(401, "unauthenticated", "Sign in required");
  const hash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT s.token_hash, s.client, s.csrf_hash, s.device_id, s.expires_at, s.revoked_at, d.revoked_at AS device_revoked,
            u.id, u.email, u.timezone, u.ai_enabled, u.daily_ai_limit, u.deleted_at
       FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN devices d ON d.id = s.device_id
      WHERE s.token_hash = ?`,
  ).bind(hash).first<Record<string, unknown>>();
  if (!row || row.revoked_at || row.device_revoked || row.deleted_at || Number(row.expires_at) < now()) throw new ApiError(401, "unauthenticated", "Session expired or revoked");
  const client = row.client as "web" | "android";
  if (bearer && client !== "android") throw new ApiError(401, "unauthenticated", "Bearer tokens are for the Android app only");
  if (!bearer && client === "android") throw new ApiError(401, "unauthenticated", "Android sessions require bearer authentication");
  if (!bearer && client === "web" && !SAFE.has(c.req.method)) {
    // Double-submit CSRF + Origin check for cookie-authenticated mutations.
    const header = c.req.header("x-csrf-token") ?? "";
    const origin = c.req.header("origin");
    const allowed = c.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    if (!header || (await sha256Hex(header)) !== row.csrf_hash) throw new ApiError(403, "forbidden", "CSRF check failed");
    if (origin && !allowed.includes(origin) && origin !== new URL(c.req.url).origin) throw new ApiError(403, "forbidden", "Origin not allowed");
  }
  const user: AuthedUser = {
    id: String(row.id), email: String(row.email), timezone: String(row.timezone), sessionHash: hash, client,
    deviceId: (row.device_id as string | null) ?? null, aiEnabled: row.ai_enabled === 1, dailyAiLimit: Number(row.daily_ai_limit),
  };
  c.set("user", user);
  await next();
};

export const logoutRoute = new Hono<AppVars>();
logoutRoute.post("/", requireAuth, async (c) => {
  await c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?").bind(now(), c.get("user").sessionHash).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  deleteCookie(c, CSRF_COOKIE, { path: "/", secure: true });
  return c.json({ ok: true });
});
