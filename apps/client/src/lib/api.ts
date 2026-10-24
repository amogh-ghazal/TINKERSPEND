import { AuthBridge, isNative } from "../native";

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)__Host-ts_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1] ?? "") : "";
}

/** All API calls go through here. Native requests use the AuthBridge so the session token never enters JavaScript. */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const full = `/api/v1${path}`;
  let status: number, text: string;
  if (isNative) {
    const r = await AuthBridge.request({ method, path: full, body: body === undefined ? undefined : JSON.stringify(body) });
    status = r.status; text = r.body;
  } else {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (method !== "GET") headers["x-csrf-token"] = csrfToken();
    const r = await fetch(full, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) });
    status = r.status; text = await r.text();
  }
  if (status === 0) throw new ApiFailure(0, "network", "Network unavailable. Nothing was saved.");
  const parsed = text && !path.endsWith(".csv") ? safeJson(text) : text;
  if (status >= 400) {
    const e = (parsed as { error?: { code?: string; message?: string; details?: unknown; fields?: unknown } })?.error;
    throw new ApiFailure(status, e?.code ?? "error", e?.message ?? `Request failed (${status})`, e?.fields ?? e?.details);
  }
  return parsed as T;
}

function safeJson(t: string): unknown { try { return JSON.parse(t); } catch { return { error: { code: "bad_response", message: "Unexpected server response" } }; } }

export const newOperationId = () => crypto.randomUUID();
