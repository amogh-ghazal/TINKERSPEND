import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("captured payment shows bank/time; purpose and duplicate confirmation preserve totals", async ({ page }, info) => {
  const email = `capture-${info.project.name}@e2e.test`;
  await login(page, email);
  const inserted = await page.evaluate(async (email) => {
    const install = `synthetic-${crypto.randomUUID()}`;
    const headers = { "content-type": "application/json" };
    const ch = await (await fetch("/api/v1/auth/challenge", { method: "POST", headers, body: JSON.stringify({ client: "android", install_id: install }) })).json();
    const claims = { iss: "https://accounts.google.com", aud: "e2e-client.apps.googleusercontent.com", exp: Math.floor(Date.now() / 1000) + 600, sub: `sub-${email}`, email, email_verified: true, nonce: ch.nonce };
    const token = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const session = await (await fetch("/api/v1/auth/google", { method: "POST", headers, body: JSON.stringify({ client: "android", install_id: install, challenge_id: ch.challenge_id, id_token: token }) })).json();
    const response = await fetch("/api/v1/notifications/batch", { method: "POST", headers: { ...headers, authorization: `Bearer ${session.token}`, "x-client": "android" }, body: JSON.stringify({ device_install_id: install, events: [{
      event_id: crypto.randomUUID(), source_package: "com.google.android.apps.messaging", source_key_hash: "synthetic-e2e", posted_at: Date.now(), captured_at: Date.now(),
      content_hash: crypto.randomUUID().replace(/-/g, "").repeat(2), parser_version: "kt-2", title: "VM-HDFCBK-S", text: "Rs.250 debited to Ravi K. UPI Ref No 912345678901", timezone: "Asia/Kolkata",
    }] }) });
    return { status: response.status, token: session.token as string, install };
  }, email);
  expect(inserted.status).toBe(200);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const row = page.getByTestId("txn").filter({ hasText: "Ravi K" });
  await expect(row.getByTestId("notification-details")).toContainText("Alert time:");
  await expect(row.getByTestId("notification-details")).toContainText("HDFC Bank");
  await row.getByRole("button", { name: "What was this payment for?", exact: true }).click();
  const form = row.getByRole("form", { name: "Explain payment" });
  await form.getByLabel("Purpose category").selectOption("food_drinks");
  await form.getByLabel("What was it for?").fill("Dinner with friends");
  await form.getByRole("button", { name: "Save purpose" }).click();
  await expect(page.getByTestId("txn")).toHaveCount(0);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(page.getByTestId("txn")).toHaveCount(1);
  await expect(page.getByTestId("txn")).toContainText("Dinner with friends");
  await expect(page.getByTestId("txn")).toContainText("Food & drinks");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("gross")).toHaveText("₹250.00");
  const duplicateStatus = await page.evaluate(async ({ token, install }) => {
    const alerts = [
      { source_package: "com.phonepe.app", title: "Paid", text: "Paid Rs.99 to Zomato." },
      { source_package: "com.google.android.apps.messaging", title: "VM-HDFCBK", text: "Rs.99 debited to Zomato." },
    ];
    const r = await fetch("/api/v1/notifications/batch", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-client": "android" }, body: JSON.stringify({ device_install_id: install, events: alerts.map((a) => ({ ...a,
      event_id: crypto.randomUUID(), source_key_hash: crypto.randomUUID(), posted_at: Date.now(), captured_at: Date.now(),
      content_hash: crypto.randomUUID().replace(/-/g, "").repeat(2), parser_version: "kt-2", timezone: "Asia/Kolkata",
    })) }) });
    return r.status;
  }, inserted);
  expect(duplicateStatus).toBe(200);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const duplicate = page.getByTestId("txn").filter({ hasText: "Zomato" });
  await expect(duplicate).toContainText("Possible duplicate alert");
  await duplicate.getByRole("button", { name: "What was this payment for?", exact: true }).click();
  const explain = duplicate.getByRole("form", { name: "Explain payment" });
  await expect(explain.getByRole("button", { name: "Save purpose" })).toBeDisabled();
  await explain.getByLabel("This was a separate payment", { exact: false }).check();
  await explain.getByLabel("What was it for?").fill("A separate second lunch");
  await explain.getByRole("button", { name: "Save purpose" }).click();
  await expect(page.getByTestId("txn")).toHaveCount(0);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("gross")).toHaveText("₹448.00");
});
