import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("navigation matches the five sections in the project flow chart", async ({ page }, info) => {
  await login(page, `owner-${info.project.name}@e2e.test`);
  const nav = page.getByRole("navigation", { name: "Sections" });
  await expect(nav.getByRole("button")).toHaveText(["Overview01", "WhatsApp02", "SuperMoney03", "Review04", "Account05"]);
  for (const omitted of ["Transactions", "Add", "Capture"]) await expect(nav.getByRole("button", { name: omitted, exact: true })).toHaveCount(0);

  await expect(page.getByTestId("gross")).toHaveText("₹0.00");
  await nav.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Needs review" })).toBeVisible();
  await expect(page.getByText("Nothing to review.")).toBeVisible();
  await nav.getByRole("button", { name: "SuperMoney", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Payment successful" })).toBeVisible();
  await nav.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
});

test("a second allowlisted account sees no personal ledger data", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, "tester@e2e.test");
  await expect(page.getByTestId("net")).toHaveText("₹0.00");
  await expect(page.getByText("No confirmed spending this month.")).toBeVisible();
  await ctx.close();
});

test("signed-out visitors see sign-in and the API rejects access without a session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Access is limited to invited Google accounts.")).toBeVisible();
  const status = await page.evaluate(async () => (await fetch("/api/v1/transactions")).status);
  expect(status).toBe(401);
});
