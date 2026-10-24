import { Hono } from "hono";
import { callResponses, reserveQuota } from "./ai";
import { extract, RECEIPT_JSON_SCHEMA, RECEIPT_PROMPT, ReceiptOut, receiptFromAi, saveDrafts } from "./drafts";
import type { AppVars, AuthedUser, Env } from "./env";
import { now, randomToken, sha256Hex } from "./util";
import { LIMITS } from "@tinkerspend/contracts";

const LINK_TTL_MS = 10 * 60_000;
const GRAPH_API = "https://graph.facebook.com/v22.0";
type MetaMessage = { id?: string; from?: string; type?: string; text?: { body?: string }; image?: { id?: string }; audio?: { id?: string } };

function base64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return [...sig].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function configured(env: Env) { return !!(env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET && env.WHATSAPP_ACCESS_TOKEN); }
function sameSignature(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function getMedia(env: Env, id: string, maxBytes: number) {
  const headers = { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetch(`${GRAPH_API}/${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(12_000) });
  if (!meta.ok) throw new Error("media_metadata");
  const info = await meta.json<{ url?: string; mime_type?: string }>();
  if (!info.url || !info.mime_type) throw new Error("media_metadata");
  const res = await fetch(info.url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error("media_download");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length || bytes.byteLength > maxBytes) throw new Error("media_size");
  return { bytes, mime: info.mime_type.toLowerCase().split(";")[0]! };
}

async function loadUser(db: D1Database, userId: string): Promise<AuthedUser | null> {
  const u = await db.prepare("SELECT id, email, timezone, ai_enabled, daily_ai_limit FROM users WHERE id = ? AND deleted_at IS NULL").bind(userId).first<{ id: string; email: string; timezone: string; ai_enabled: number; daily_ai_limit: number }>();
  return u ? { id: u.id, email: u.email, timezone: u.timezone, aiEnabled: u.ai_enabled === 1, dailyAiLimit: u.daily_ai_limit, sessionHash: "whatsapp", client: "web", deviceId: null } : null;
}

async function processImage(env: Env, user: AuthedUser, bytes: Uint8Array, mime: string, ref: number) {
  const magic: Record<string, number[]> = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47] };
  if (!magic[mime] || !magic[mime]!.every((v, i) => bytes[i] === v)) throw new Error("unsupported_image");
  if (!user.aiEnabled || !env.OPENAI_API_KEY) throw new Error("ai_not_configured");
  const q = await reserveQuota(env.DB, user.id, "receipt", Number(env.AI_USER_RECEIPT_LIMIT ?? "10"), Number(env.AI_DAILY_GLOBAL_LIMIT ?? "100"));
  if (!q.ok) throw new Error(`quota_${q.scope}`);
  const data = base64(bytes); const hash = await sha256Hex(data);
  const duplicate = await env.DB.prepare("SELECT transaction_id FROM receipt_links WHERE user_id = ? AND image_sha256 = ? AND undone_at IS NULL LIMIT 1").bind(user.id, hash).first<{ transaction_id: string }>();
  const up = await callResponses(env, env.OPENAI_EXTRACT_MODEL, RECEIPT_PROMPT, [{ type: "input_text", text: "Extract this receipt." }, { type: "input_image", image_url: `data:${mime};base64,${data}`, detail: "high" }], "receipt", RECEIPT_JSON_SCHEMA, 4000);
  let parsed: ReturnType<typeof ReceiptOut.safeParse>["data"] | null = null;
  if (up.type === "ok") { try { const r = ReceiptOut.safeParse(JSON.parse(up.text)); if (r.success) parsed = r.data; } catch { /* handled as review */ } }
  const item = parsed ? receiptFromAi(parsed, ref, user.timezone, hash, duplicate?.transaction_id ?? null) : receiptFromAi({ legible: false, merchant: null, date: null, currency: "INR", total: null, taxes: [], fees: [], discounts: [], line_items: [], more_lines_than_listed: false }, ref, user.timezone, hash, duplicate?.transaction_id ?? null);
  await saveDrafts(env.DB, user, "receipt", ref, user.timezone, [item], parsed ? "ai" : "deterministic", {});
}

async function processAudio(env: Env, user: AuthedUser, bytes: Uint8Array, mime: string, ref: number) {
  const extensions: Record<string, string> = { "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/webm": "webm" };
  const ext = extensions[mime];
  if (!ext || !user.aiEnabled || !env.OPENAI_API_KEY) throw new Error(!ext ? "unsupported_audio" : "ai_not_configured");
  const q = await reserveQuota(env.DB, user.id, "voice", Number(env.AI_USER_VOICE_LIMIT ?? "20"), Number(env.AI_DAILY_GLOBAL_LIMIT ?? "100"));
  if (!q.ok) throw new Error(`quota_${q.scope}`);
  const form = new FormData(); form.append("file", new Blob([bytes], { type: mime }), `whatsapp.${ext}`); form.append("model", env.OPENAI_TRANSCRIBE_MODEL); form.append("language", "en"); form.append("response_format", "json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error("transcription_failed");
  const transcript = ((await res.json() as { text?: string }).text ?? "").trim().slice(0, LIMITS.textChars);
  const out = transcript ? await extract(env, user, transcript, ref, user.timezone) : { items: [], method: "deterministic" as const };
  await saveDrafts(env.DB, user, "voice", ref, user.timezone, out.items, out.method, { transcript });
}

async function processMessage(env: Env, m: MetaMessage) {
  if (!m.id || !m.from || !m.type) return;
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO whatsapp_events (message_id, kind, received_at, status) VALUES (?,?,?,'received')").bind(m.id, m.type, now()).run();
  if (!inserted.meta.changes) return;
  const text = m.type === "text" ? (m.text?.body ?? "").trim() : "";
  if (text.toUpperCase().startsWith("LINK ")) {
    const hash = await sha256Hex(text.slice(5).trim().toUpperCase());
    const row = await env.DB.prepare("UPDATE whatsapp_links SET wa_id = ?, link_code_hash = NULL, link_code_expires_at = NULL, linked_at = ?, updated_at = ? WHERE link_code_hash = ? AND link_code_expires_at > ? RETURNING user_id").bind(m.from, now(), now(), hash, now()).first<{ user_id: string }>();
    await env.DB.prepare("UPDATE whatsapp_events SET user_id = ?, status = ? WHERE message_id = ?").bind(row?.user_id ?? null, row ? "linked" : "unlinked", m.id).run();
    return;
  }
  const link = await env.DB.prepare("SELECT user_id FROM whatsapp_links WHERE wa_id = ?").bind(m.from).first<{ user_id: string }>();
  if (!link) { await env.DB.prepare("UPDATE whatsapp_events SET status = 'unlinked' WHERE message_id = ?").bind(m.id).run(); return; }
  const user = await loadUser(env.DB, link.user_id);
  if (!user) { await env.DB.prepare("UPDATE whatsapp_events SET status = 'inactive' WHERE message_id = ?").bind(m.id).run(); return; }
  try {
    if (m.type === "text" && text) { const out = await extract(env, user, text.slice(0, LIMITS.textChars), now(), user.timezone); await saveDrafts(env.DB, user, "text", now(), user.timezone, out.items, out.method, { input_text: text.slice(0, 1000) }); }
    else if (m.type === "image" && m.image?.id) { const media = await getMedia(env, m.image.id, LIMITS.imageBytes); await processImage(env, user, media.bytes, media.mime, now()); }
    else if (m.type === "audio" && m.audio?.id) { const media = await getMedia(env, m.audio.id, LIMITS.audioBytes); await processAudio(env, user, media.bytes, media.mime, now()); }
    else { throw new Error("unsupported_message"); }
    await env.DB.prepare("UPDATE whatsapp_events SET user_id = ?, status = 'draft_created' WHERE message_id = ?").bind(user.id, m.id).run();
  } catch (e) { await env.DB.prepare("UPDATE whatsapp_events SET user_id = ?, status = 'needs_review', error_code = ? WHERE message_id = ?").bind(user.id, e instanceof Error ? e.message.slice(0, 80) : "processing_failed", m.id).run(); }
}

export const whatsappWebhook = new Hono<AppVars>();
whatsappWebhook.get("/webhook", (c) => {
  if (!configured(c.env) || c.req.query("hub.mode") !== "subscribe" || c.req.query("hub.verify_token") !== c.env.WHATSAPP_VERIFY_TOKEN) return c.text("Forbidden", 403);
  return c.text(c.req.query("hub.challenge") ?? "", 200);
});
whatsappWebhook.post("/webhook", async (c) => {
  if (!configured(c.env)) return c.text("Not configured", 503);
  const raw = await c.req.text(); const supplied = c.req.header("x-hub-signature-256")?.replace(/^sha256=/, "") ?? "";
  const expected = await hmacHex(c.env.WHATSAPP_APP_SECRET!, raw);
  if (!sameSignature(supplied, expected)) return c.text("Forbidden", 403);
  let body: { entry?: { changes?: { value?: { messages?: MetaMessage[] } }[] }[] }; try { body = JSON.parse(raw); } catch { return c.text("Bad request", 400); }
  const messages = body.entry?.flatMap((e) => e.changes?.flatMap((x) => x.value?.messages ?? []) ?? []) ?? [];
  for (const message of messages) c.executionCtx.waitUntil(processMessage(c.env, message));
  return c.text("OK", 200);
});

export const whatsappSettings = new Hono<AppVars>();
whatsappSettings.post("/link", async (c) => {
  const user = c.get("user"); const code = randomToken(9).replace(/[-_]/g, "A").slice(0, 10).toUpperCase(); const t = now();
  await c.env.DB.prepare("INSERT INTO whatsapp_links (user_id, link_code_hash, link_code_expires_at, created_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET link_code_hash = excluded.link_code_hash, link_code_expires_at = excluded.link_code_expires_at, updated_at = excluded.updated_at").bind(user.id, await sha256Hex(code), t + LINK_TTL_MS, t, t).run();
  return c.json({ code, expires_at: t + LINK_TTL_MS });
});
whatsappSettings.get("/status", async (c) => {
  const row = await c.env.DB.prepare("SELECT wa_id, linked_at FROM whatsapp_links WHERE user_id = ?").bind(c.get("user").id).first<{ wa_id: string | null; linked_at: number | null }>();
  return c.json({ linked: !!row?.wa_id, linked_at: row?.linked_at ?? null });
});
