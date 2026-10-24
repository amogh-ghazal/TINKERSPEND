import { env, exports } from "cloudflare:workers";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const E = env as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const worker = (exports as any).default as { fetch(r: Request): Promise<Response> };
const BASE = "https://expenses.test";

export function idToken(claims: Record<string, unknown>) {
  return btoa(JSON.stringify({ iss: "https://accounts.google.com", aud: "test-client.apps.googleusercontent.com", exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await worker.fetch(new Request(BASE + path, { method, headers, body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) }));
  const text = await res.text();
  let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text, headers: res.headers };
}

export async function allow(email: string) {
  await E.DB.prepare("INSERT OR IGNORE INTO allowlist (email, added_at) VALUES (?, ?)").bind(email, Date.now()).run();
}

export async function loginAndroid(sub: string, email: string, installId = `install-${sub}-0001`) {
  await allow(email);
  const ch = await call("POST", "/api/v1/auth/challenge", { body: { client: "android", install_id: installId } });
  const r = await call("POST", "/api/v1/auth/google", { body: { challenge_id: ch.json.challenge_id, id_token: idToken({ sub, email, nonce: ch.json.nonce }), client: "android", install_id: installId } });
  if (r.status !== 200) throw new Error("login failed " + r.status + " " + r.text);
  return { token: r.json.token as string, userId: r.json.user.id as string, installId };
}

export const uuid = () => crypto.randomUUID();
