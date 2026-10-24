import { expect, test } from "@playwright/test";
import { addTxn, login } from "./helpers";

const M = "2026-09";

test.describe.configure({ mode: "serial" });

test("baseline fixture via the UI: gross 560, refunds 50, net 510, review 250, pending 700", async ({ page }, info) => {
  await login(page, `owner-${info.project.name}@e2e.test`);
  const tag = info.project.name;
  await addTxn(page, { amount: "300", date: `${M}-03`, who: `Cafe ${tag}`, category: "Food & drinks" });
  await addTxn(page, { amount: "260", date: `${M}-05`, who: `Store ${tag}`, category: "Shopping" });
  await addTxn(page, { amount: "250", kind: "unknown", date: `${M}-07`, who: `Unknown ${tag}` });
  await addTxn(page, { amount: "700", status: "pending", date: `${M}-09`, who: `Pending ${tag}`, category: "Shopping" });
  await addTxn(page, { amount: "1,000", kind: "income", date: `${M}-10`, who: `Salary ${tag}` });
  await addTxn(page, { amount: "400", kind: "transfer", date: `${M}-11`, who: `Self ${tag}` });
  await addTxn(page, { amount: "90", status: "failed", date: `${M}-12`, who: `Failed ${tag}`, category: "Shopping" });

  const store = page.getByTestId("txn").filter({ hasText: `Store ${tag}` });
  await store.getByRole("button", { name: "Refund" }).click();
  await store.getByLabel("Refund amount (₹)").fill("300");
  await store.getByLabel("Refund received on").fill(`${M}-20`);
  await store.getByRole("button", { name: "Save refund" }).click();
  await expect(store.getByRole("alert")).toBeVisible(); // refund > remaining is rejected
  await store.getByLabel("Refund amount (₹)").fill("50");
  await store.getByRole("button", { name: "Save refund" }).click();

  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "September 2026" })).toBeVisible();
  await expect(page.getByTestId("gross")).toHaveText("₹560.00");
  await expect(page.getByTestId("refunds")).toHaveText("₹50.00");
  await expect(page.getByTestId("net")).toHaveText("₹510.00");
  await expect(page.getByTestId("review")).toHaveText("₹250.00");
  await expect(page.getByTestId("pending")).toHaveText("₹700.00");
  await page.screenshot({ path: `test-results/overview-${tag}.png`, fullPage: true });
});

test("isolation: a second allowlisted user sees none of the owner's data", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, "tester@e2e.test");
  for (let i = 0; i < 24 && !(await page.getByRole("heading", { name: "September 2026" }).isVisible()); i++) {
    await page.getByRole("button", { name: "Previous month" }).click();
  }
  await expect(page.getByTestId("net")).toHaveText("₹0.00");
  await expect(page.getByText("No confirmed spending this month.")).toBeVisible();
  await ctx.close();
});

test("review, edit, delete and CSV export with formula neutralization", async ({ page }, info) => {
  await login(page, "owner@e2e.test");
  const tag = `${info.project.name}-x`;
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
  await addTxn(page, { amount: "45.50", kind: "unknown", date: today, who: `=HYPERLINK("x") ${tag}` });
  await page.getByRole("button", { name: "Review" }).click();
  const row = page.getByTestId("txn").filter({ hasText: tag });
  await row.getByRole("button", { name: "Edit" }).click();
  await row.getByLabel("Type").selectOption("expense");
  await row.getByLabel("Category", { exact: true }).selectOption({ label: "Groceries" });
  await row.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("txn").filter({ hasText: tag })).toHaveCount(0); // left the review queue

  await page.getByRole("button", { name: "Account" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = await (await (await dl).createReadStream()).toArray().then((b) => Buffer.concat(b).toString("utf8"));
  expect(csv).toContain(`'=HYPERLINK`);
  expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);

  await page.getByRole("button", { name: "Transactions" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("txn").filter({ hasText: tag }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("txn").filter({ hasText: tag })).toHaveCount(0);
});

test("signed-out visitor sees sign-in and no data; API rejects without session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Access is limited to invited Google accounts.")).toBeVisible();
  const s = await page.evaluate(async () => (await fetch("/api/v1/transactions")).status);
  expect(s).toBe(401);
});
