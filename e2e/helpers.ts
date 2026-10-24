import { expect, type Page } from "@playwright/test";

/** Signs in through the real /auth/challenge + /auth/google endpoints using the local-only test token verifier. */
export async function login(page: Page, email: string) {
  await page.goto("/");
  const status = await page.evaluate(async (email) => {
    const ch = await (await fetch("/api/v1/auth/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client: "web" }) })).json();
    const claims = { iss: "https://accounts.google.com", aud: "e2e-client.apps.googleusercontent.com", exp: Math.floor(Date.now() / 1000) + 600, sub: `sub-${email}`, email, email_verified: true, nonce: ch.nonce };
    const tok = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const r = await fetch("/api/v1/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challenge_id: ch.challenge_id, id_token: tok, client: "web" }) });
    return r.status;
  }, email);
  expect(status).toBe(200);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
}

export async function addTxn(page: Page, o: { amount: string; kind?: string; status?: string; date: string; who: string; category?: string }) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const f = page.getByRole("form", { name: "Add transaction" });
  await f.getByLabel("Amount (₹)").fill(o.amount);
  if (o.kind) await f.getByLabel("Type").selectOption(o.kind);
  if (o.status) await f.getByLabel("Payment status").selectOption(o.status);
  await f.getByLabel("Date").fill(o.date);
  await f.getByLabel("Merchant / person").fill(o.who);
  if (o.category) await f.getByLabel("Category").selectOption({ label: o.category });
  await f.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
}
