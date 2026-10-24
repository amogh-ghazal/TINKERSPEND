import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";
import type { Draft, Txn } from "../apps/client/src/lib/types";
import { login } from "./helpers";

/** Browser UI contract tests with mocked extraction/draft APIs. Real D1 reconciliation is tested separately. */
async function receiptFixture(page: Page, mode: "correct" | "total" | "attach") {
  const date = new Date().toISOString().slice(0, 10);
  let current: Draft | null = null;
  let committed: Record<string, unknown> | null = null;
  let uploaded: Record<string, unknown> | null = null;
  let undone = false;
  const entry = {
    amount: "350.00", currency: "INR", effective_local_date: date, counterparty: "Fixture Mart", description: "Receipt: Fixture Mart",
    kind: "expense" as const, payment_status: "successful" as const, category_id: "groceries" as const,
    line_items: [{ description: "Rice", amount: "200.00", category_id: "groceries" as const }, { description: "Soap", amount: "100.00", category_id: "household" as const }],
  };
  const txn: Txn = { id: "notification-fixture", kind: "expense", payment_status: "successful", review_state: "confirmed", amount: "350.00", amount_paise: 35000,
    effective_local_date: date, direction: "outgoing", counterparty: "Fixture Mart", description: null, source: mode === "attach" ? "notification" : "receipt",
    provenance: "notification", original_transaction_id: null, merged_into_id: null, user_edited_fields: [], version: 1, allocations: [{ category_id: "groceries", amount_paise: 35000 }],
    created_at: Date.now(), updated_at: Date.now(), receipt_draft_id: null, suggestion: null };
  await page.route("**/api/v1/drafts**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.method() === "GET" ? {} : req.postDataJSON() ?? {};
    let response: unknown;
    if (path.endsWith("/drafts/receipt")) {
      uploaded = body;
      current = { id: "receipt-ui", source: "receipt", status: "open", version: 1, reference_at: Date.now(), timezone: "Asia/Kolkata", entry,
        assumptions: ["receipt_mismatch"], extraction: "ai", input_text: null, transcript: null,
        receipt: { merchant: "Fixture Mart", taxes: [], fees: [], discounts: [], duplicate_of: null } };
      response = { drafts: [current] };
    } else if (path.endsWith("/matches")) response = { items: mode === "attach" ? [{ score: 100, transaction: txn }] : [] };
    else if (path.endsWith("/detach")) { undone = true; txn.receipt_draft_id = null; response = { draft: current }; }
    else if (path.endsWith("/commit")) {
      committed = body;
      txn.amount = current!.entry.amount!; txn.amount_paise = Math.round(Number(txn.amount) * 100); txn.receipt_draft_id = current!.id;
      current = null; response = { transaction: txn };
    } else if (req.method() === "PATCH") {
      current = { ...current!, version: current!.version + 1, entry: { ...current!.entry, ...body.entry } };
      response = { draft: current };
    } else response = { items: current ? [current] : [] };
    await route.fulfill({ json: response });
  });
  await page.route("**/api/v1/transactions?**", (route) => route.fulfill({ json: { items: committed || mode === "attach" ? [txn] : [] } }));
  return { uploaded: () => uploaded, committed: () => committed, undone: () => undone };
}

async function photo(page: Page) {
  // Generate a valid image through browser canvas, then exercise the actual JPEG normalization path.
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 120; c.height = 200;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, 120, 200); ctx.fillStyle = "black"; ctx.fillText("SYNTHETIC RECEIPT", 2, 20);
    return c.toDataURL("image/png").split(",")[1]!; });
  await page.getByLabel("Receipt from gallery").setInputFiles({ name: "synthetic-receipt.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.getByRole("img", { name: "Receipt to read" })).toBeVisible();
  await page.getByRole("button", { name: "Read receipt", exact: true }).click();
  await expect(page.getByTestId("draft")).toHaveCount(1);
  await expect(page.getByTestId("draft").getByRole("img", { name: "Receipt", exact: true })).toBeVisible();
}

for (const mode of ["correct", "total", "attach"] as const) {
  test(`receipt photo → ${mode} → one ledger item with a local photo`, async ({ page }, info) => {
    await login(page, `drafts-${info.project.name}@e2e.test`);
    const state = await receiptFixture(page, mode);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await photo(page);
    expect(state.uploaded()?.mime_type).toBe("image/jpeg");
    expect(Buffer.from(String(state.uploaded()?.data_base64), "base64").length).toBeLessThanOrEqual(750 * 1024);
    const card = page.getByTestId("draft");
    await expect(card).toContainText("From receipt");
    await expect(card).toContainText("don't add up");
    if (mode === "attach") {
      await card.getByRole("button", { name: "Attach to this" }).click();
      expect(state.committed()?.attach_to_transaction_id).toBe("notification-fixture");
    } else {
      await card.getByLabel("I paid this").check();
      if (mode === "correct") {
        await card.getByLabel("Amount (₹)").fill("300.00");
        await card.getByLabel("Item 1 amount", { exact: true }).fill("190.00");
        await card.getByLabel("Item 2 amount", { exact: true }).fill("110.00");
        await card.getByRole("button", { name: "Save", exact: true }).click();
        await expect.poll(() => state.committed()?.version).toBe(2);
      } else {
        await card.getByRole("button", { name: "Save total only" }).click();
        expect(state.committed()?.ignore_line_items).toBe(true);
      }
      expect(state.committed()?.paid_confirmed).toBe(true);
    }
    await expect(card).toHaveCount(0);
    await page.getByRole("button", { name: "Transactions" }).click();
    await expect(page.getByTestId("txn")).toHaveCount(1);
    await expect(page.getByTestId("receipt-badge")).toContainText("Receipt saved on this device");
    await page.screenshot({ path: `test-results/receipt-${mode}-${info.project.name}.png`, fullPage: true });
    if (mode === "attach") {
      await page.getByRole("button", { name: "Undo receipt attachment" }).click();
      await expect(page.getByTestId("receipt-badge")).toHaveCount(0);
      await expect(page.getByTestId("txn")).toHaveCount(1);
      expect(state.undone()).toBe(true);
    }
  });
}
