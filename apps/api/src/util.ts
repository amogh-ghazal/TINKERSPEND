import type { Context } from "hono";
import type { ErrorCode } from "@tinkerspend/contracts";

export class ApiError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string, public retryable = false, public retryAfter?: number, public fields?: Record<string, string>) {
    super(message);
  }
}

export function errorResponse(c: Context, e: ApiError) {
  const body = { error: { code: e.code, message: e.message, retryable: e.retryable, request_id: c.get("requestId") ?? "unknown", ...(e.fields ? { fields: e.fields } : {}) } };
  const headers: Record<string, string> = {};
  if (e.retryAfter) headers["Retry-After"] = String(e.retryAfter);
  return c.json(body, e.status as 400, headers);
}

export const now = () => Date.now();
export const uuid = () => crypto.randomUUID();

export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function zodFields(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues.slice(0, 20)) out[i.path.map(String).join(".") || "_"] = i.message;
  return out;
}

export async function parseJson<T>(c: Context, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, maxBytes = 64 * 1024): Promise<T> {
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > maxBytes) throw new ApiError(413, "payload_too_large", "Request body too large");
  const text = await c.req.text();
  if (text.length > maxBytes) throw new ApiError(413, "payload_too_large", "Request body too large");
  let raw: unknown;
  try { raw = JSON.parse(text || "{}"); } catch { throw new ApiError(400, "validation_failed", "Malformed JSON"); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError(422, "validation_failed", "Validation failed", false, undefined, zodFields(r.error.issues));
  return r.data;
}
