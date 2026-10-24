import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("typed statement → two editable drafts → explicit save with paid confirmation", async ({ page }, info) => {
  await login(page, `drafts-${info.project.name}@e2e.test`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const qa = page.getByRole("region", { name: "Quick add" });
  await qa.getByLabel("Describe expenses").fill("Yesterday, lunch 180 and auto 80");
  await qa.getByRole("button", { name: "Make drafts" }).click();
  const drafts = qa.getByTestId("draft");
  await expect(drafts).toHaveCount(2);
  const yesterday = await page.evaluate(() => { const d = new Date(Date.now() - 86_400_000); return new Intl.DateTimeFormat("en-CA", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(d); });
  const lunch = drafts.nth(0);
  await expect(lunch.getByLabel("Amount (₹)")).toHaveValue("180.00");
  await expect(lunch.getByLabel("Date")).toHaveValue(yesterday);
  await expect(drafts.nth(1).getByLabel("Amount (₹)")).toHaveValue("80.00");

  await lunch.getByRole("button", { name: "Save" }).click();
  await expect(lunch.getByRole("alert")).toContainText("I paid this"); // no silent commit
  await lunch.getByLabel("Amount (₹)").fill("190");
  await lunch.getByLabel("I paid this").check();
  await lunch.getByRole("button", { name: "Save" }).click();
  await expect(drafts).toHaveCount(1);
  await drafts.nth(0).getByRole("button", { name: "Discard" }).click();
  await expect(drafts).toHaveCount(0);

  await page.getByRole("button", { name: "Transactions" }).click();
  await expect(page.getByTestId("txn").filter({ hasText: "190.00" })).toHaveCount(1);
  await expect(page.getByTestId("txn").filter({ hasText: "80.00" })).toHaveCount(0);
});
