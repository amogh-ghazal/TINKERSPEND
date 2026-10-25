import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("SuperMoney share creates a reviewable draft and a timely chat reply categorizes it", async ({ page }, info) => {
  await login(page, `supermoney-${info.project.name}@e2e.test`);
  const sections = page.getByRole("navigation", { name: "Sections" });
  await expect(sections.getByRole("button")).toHaveText(["Overview01", "WhatsApp02", "SuperMoney03", "Review04", "Account05"]);
  await expect(sections.getByRole("button", { name: "Transactions" })).toHaveCount(0);

  await sections.getByRole("button", { name: "SuperMoney" }).click();
  await expect(page.getByRole("heading", { name: "Payment successful" })).toBeVisible();
  await page.screenshot({ path: "test-results/supermoney-payment-demo.png", fullPage: true });
  await page.getByRole("button", { name: "Share payment" }).click();
  await page.screenshot({ path: "test-results/supermoney-share-sheet.png", fullPage: true });
  await page.locator(".sm-share-targets").getByRole("button", { name: "WhatsApp" }).click();
  await page.getByRole("button", { name: /Amogh \(You\)/ }).click();
  await expect(page.getByRole("button", { name: /Send/ })).toBeEnabled();
  await page.getByRole("button", { name: /Send/ }).click();

  const chat = page.getByRole("region", { name: "WhatsApp concept demo" });
  await expect(chat.locator(".chat-message.assistant").last()).toContainText("What was this for?");
  await page.screenshot({ path: "test-results/supermoney-shared-to-chat.png", fullPage: true });
  await expect(chat.getByTestId("draft")).toContainText("Synthetic SuperMoney demo data");
  await expect(chat.getByLabel("Amount (₹)")).toHaveValue("3500.00");
  await chat.locator("#expense-message").fill("Dinner with friends");
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect(chat.locator(".chat-message.assistant").last()).toContainText("categorized as Food & drinks");
  await expect(chat.getByTestId("draft").getByLabel("Draft category")).toHaveValue("food_drinks");
});
