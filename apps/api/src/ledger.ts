import { Hono } from "hono";
import { ManualTransactionInput, TransactionPatch, RefundInput, ListQuery, SummaryQuery, CategoryRuleInput } from "@tinkerspend/contracts";
import {
  parseRupeesToPaise, allocateProportionally, summarizeMonth, refundWithinLimit, monthBounds, csvRow, paiseToDecimalString,
  deterministicCategory, normalizeMerchant, type LedgerTransaction, type CategoryId,
} from "@tinkerspend/domain";
import type { AppVars } from "./env";
import { ApiError, now, parseJson, uuid } from "./util";

export function toPaise(amount: string, field = "amount"): number {
  const r = parseRupeesToPaise(amount);
  if (!r.ok) throw new ApiError(422, "validation_failed", "Invalid amount", false, undefined, { [field]: r.error });
  return r.paise;
}

type Alloc = { category: CategoryId; amountPaise: number };

export function buildAllocations(total: number, allocations?: { category_id: CategoryId; amount: string }[], category?: CategoryId): Alloc[] {
  if (allocations && allocations.length > 0) {
    const out = allocations.map((a, i) => ({ category: a.category_id, amountPaise: toPaise(a.amount, `allocations.${i}.amount`) }));
    const sum = out.reduce((s, a) => s + a.amountPaise, 0);
    if (sum !== total) throw new ApiError(422, "validation_failed", `Allocations total ${paiseToDecimalString(sum)} does not equal amount ${paiseToDecimalString(total)}`, false, undefined, { allocations: "sum_mismatch" });
    return out;
  }
  return [{ category: category ?? "uncategorized", amountPaise: total }];
}

export interface TxnRow {
  id: string; kind: string; payment_status: string; review_state: string; amount_paise: number; occurred_on: string; direction: string;
  counterparty: string | null; note: string | null; source: string; provenance: string; original_txn_id: string | null; merged_into_id: string | null;
  user_edited_fields: string; version: number; created_at: number; updated_at: number;
}

export async function loadTxn(db: D1Database, userId: string, id: string): Promise<TxnRow> {
  const t = await db.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL").bind(id, userId).first<TxnRow>();
  if (!t) throw new ApiError(404, "not_found", "Transaction not found");
  return t;
}

async function allocationsFor(db: D1Database, userId: string, ids: string[]) {
  const map = new Map<string, Alloc[]>();
  if (ids.length === 0) return map;
  const rs = await db.prepare(`SELECT transaction_id, category, amount_paise FROM allocations WHERE user_id = ? AND transaction_id IN (${ids.map(() => "?").join(",")})`)
    .bind(userId, ...ids).all<{ transaction_id: string; category: CategoryId; amount_paise: number }>();
  for (const r of rs.results) {
    const arr = map.get(r.transaction_id) ?? [];
    arr.push({ category: r.category, amountPaise: r.amount_paise });
    map.set(r.transaction_id, arr);
  }
  return map;
}

export interface SuggestionRow { category: CategoryId; kind: string; reason: string | null; model: string }

export async function suggestionsFor(db: D1Database, userId: string, ids: string[]) {
  const map = new Map<string, SuggestionRow>();
  if (ids.length === 0) return map;
  const rs = await db.prepare(`SELECT transaction_id, category, kind, reason, model FROM txn_suggestions WHERE user_id = ? AND transaction_id IN (${ids.map(() => "?").join(",")})`)
    .bind(userId, ...ids).all<SuggestionRow & { transaction_id: string }>();
  for (const r of rs.results) map.set(r.transaction_id, { category: r.category, kind: r.kind, reason: r.reason, model: r.model });
  return map;
}

export function present(t: TxnRow, allocs: Alloc[], suggestion?: SuggestionRow | null) {
  return {
    id: t.id, kind: t.kind, payment_status: t.payment_status, review_state: t.review_state,
    amount_paise: t.amount_paise, amount: paiseToDecimalString(t.amount_paise), effective_local_date: t.occurred_on, direction: t.direction,
    counterparty: t.counterparty, description: t.note, source: t.source, provenance: t.provenance, original_transaction_id: t.original_txn_id,
    merged_into_id: t.merged_into_id, user_edited_fields: JSON.parse(t.user_edited_fields) as string[], version: t.version,
    allocations: allocs.map((a) => ({ category_id: a.category, amount_paise: a.amountPaise })), created_at: t.created_at, updated_at: t.updated_at,
    suggestion: t.review_state === "needs_review" && suggestion ? { category_id: suggestion.category, kind: suggestion.kind, reason: suggestion.reason, model: suggestion.model } : null,
  };
}

export interface InsertTxn {
  userId: string; kind: string; paymentStatus: string; reviewState: string; amountPaise: number; date: string; direction: string;
  counterparty: string | null; note: string | null; source: string; provenance: string; operationId: string | null; originalTxnId?: string | null;
  allocations: Alloc[]; categorySource?: string;
}

/** Returns statements so callers can batch atomically with other writes. */
export function insertTxnStatements(db: D1Database, id: string, t: InsertTxn): D1PreparedStatement[] {
  const ts = now();
  const stmts = [db.prepare(
    `INSERT INTO transactions (id, user_id, kind, payment_status, review_state, amount_paise, occurred_on, direction, counterparty, note, source, provenance, operation_id, original_txn_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(id, t.userId, t.kind, t.paymentStatus, t.reviewState, t.amountPaise, t.date, t.direction, t.counterparty, t.note, t.source, t.provenance, t.operationId, t.originalTxnId ?? null, ts, ts)];
  for (const a of t.allocations) {
    stmts.push(db.prepare("INSERT INTO allocations (id, user_id, transaction_id, category, amount_paise, category_source) VALUES (?,?,?,?,?,?)")
      .bind(uuid(), t.userId, id, a.category, a.amountPaise, t.categorySource ?? "user"));
  }
  return stmts;
}

export async function applyRules(db: D1Database, userId: string, counterparty: string | null): Promise<{ category: CategoryId; kind: string | null; source: "rule" | "merchant_map" } | null> {
  if (!counterparty) return null;
  const rule = await db.prepare("SELECT category, kind FROM category_rules WHERE user_id = ? AND match_type = 'counterparty_exact' AND pattern = ?")
    .bind(userId, normalizeMerchant(counterparty)).first<{ category: CategoryId; kind: string | null }>();
  if (rule) return { category: rule.category, kind: rule.kind, source: "rule" };
  const det = deterministicCategory(counterparty);
  return det ? { category: det, kind: null, source: "merchant_map" } : null;
}

export const ledger = new Hono<AppVars>();

ledger.post("/transactions", async (c) => {
  const u = c.get("user");
  const b = await parseJson(c, ManualTransactionInput);
  const existing = await c.env.DB.prepare("SELECT id FROM transactions WHERE user_id = ? AND operation_id = ?").bind(u.id, b.operation_id).first<{ id: string }>();
  if (existing) {
    const t = await loadTxn(c.env.DB, u.id, existing.id);
    return c.json({ transaction: present(t, (await allocationsFor(c.env.DB, u.id, [t.id])).get(t.id) ?? []), replayed: true });
  }
  if (b.kind === "refund") throw new ApiError(422, "validation_failed", "Use the refund endpoint to link refunds to an original purchase", false, undefined, { kind: "use_refund_endpoint" });
  const amount = toPaise(b.amount);
  let category = b.category_id;
  if (!category && !b.allocations && b.kind === "expense") category = (await applyRules(c.env.DB, u.id, b.counterparty ?? null))?.category;
  const allocs = buildAllocations(amount, b.allocations, category);
  const id = uuid();
  const direction = b.kind === "income" ? "incoming" : b.kind === "unknown" ? "unknown" : "outgoing";
  try {
    await c.env.DB.batch(insertTxnStatements(c.env.DB, id, {
      userId: u.id, kind: b.kind, paymentStatus: b.payment_status, reviewState: b.kind === "unknown" ? "needs_review" : "confirmed", amountPaise: amount,
      date: b.effective_local_date, direction, counterparty: b.counterparty ?? null, note: b.description ?? null, source: "manual", provenance: b.provenance,
      operationId: b.operation_id, allocations: allocs,
    }));
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      const again = await c.env.DB.prepare("SELECT id FROM transactions WHERE user_id = ? AND operation_id = ?").bind(u.id, b.operation_id).first<{ id: string }>();
      if (again) { const t = await loadTxn(c.env.DB, u.id, again.id); return c.json({ transaction: present(t, (await allocationsFor(c.env.DB, u.id, [t.id])).get(t.id) ?? []), replayed: true }); }
    }
    throw e;
  }
  const t = await loadTxn(c.env.DB, u.id, id);
  return c.json({ transaction: present(t, allocs), replayed: false }, 201);
});

ledger.get("/transactions", async (c) => {
  const u = c.get("user");
  const q = ListQuery.safeParse(c.req.query());
  if (!q.success) throw new ApiError(422, "validation_failed", "Invalid query");
  const where = ["t.user_id = ?", "t.deleted_at IS NULL", "t.merged_into_id IS NULL"];
  const args: unknown[] = [u.id];
  if (q.data.month) { const b = monthBounds(q.data.month); where.push("t.occurred_on >= ? AND t.occurred_on < ?"); args.push(b.start, b.endExclusive); }
  if (q.data.kind) { where.push("t.kind = ?"); args.push(q.data.kind); }
  if (q.data.category_id) { where.push("EXISTS (SELECT 1 FROM allocations a WHERE a.transaction_id = t.id AND a.user_id = t.user_id AND a.category = ?)"); args.push(q.data.category_id); }
  if (q.data.q) { where.push("(t.counterparty LIKE ? ESCAPE '\\' OR t.note LIKE ? ESCAPE '\\')"); const like = `%${q.data.q.replace(/[\\%_]/g, (m) => "\\" + m)}%`; args.push(like, like); }
  if (q.data.cursor) {
    const [d, id] = q.data.cursor.split("|");
    if (!d || !id) throw new ApiError(422, "validation_failed", "Bad cursor");
    where.push("(t.occurred_on < ? OR (t.occurred_on = ? AND t.id < ?))"); args.push(d, d, id);
  }
  const rs = await c.env.DB.prepare(`SELECT t.* FROM transactions t WHERE ${where.join(" AND ")} ORDER BY t.occurred_on DESC, t.id DESC LIMIT ?`).bind(...args, q.data.limit + 1).all<TxnRow>();
  const rows = rs.results.slice(0, q.data.limit);
  const allocs = await allocationsFor(c.env.DB, u.id, rows.map((r) => r.id));
  const sugg = await suggestionsFor(c.env.DB, u.id, rows.filter((r) => r.review_state === "needs_review").map((r) => r.id));
  const last = rows[rows.length - 1];
  return c.json({ items: rows.map((r) => present(r, allocs.get(r.id) ?? [], sugg.get(r.id))), next_cursor: rs.results.length > q.data.limit && last ? `${last.occurred_on}|${last.id}` : null });
});

ledger.get("/transactions/:id", async (c) => {
  const u = c.get("user");
  const t = await loadTxn(c.env.DB, u.id, c.req.param("id"));
  const refs = await c.env.DB.prepare("SELECT namespace, value FROM txn_refs WHERE user_id = ? AND transaction_id = ?").bind(u.id, t.id).all();
  const refunds = await c.env.DB.prepare("SELECT id, amount_paise, occurred_on FROM transactions WHERE user_id = ? AND original_txn_id = ? AND deleted_at IS NULL").bind(u.id, t.id).all();
  const evidence = await c.env.DB.prepare("SELECT source_package, posted_at, outcome FROM source_events WHERE user_id = ? AND transaction_id = ? ORDER BY posted_at").bind(u.id, t.id).all();
  return c.json({ transaction: present(t, (await allocationsFor(c.env.DB, u.id, [t.id])).get(t.id) ?? [], (await suggestionsFor(c.env.DB, u.id, [t.id])).get(t.id)), references: refs.results, refunds: refunds.results, evidence: evidence.results });
});

ledger.patch("/transactions/:id", async (c) => {
  const u = c.get("user");
  const b = await parseJson(c, TransactionPatch);
  const t = await loadTxn(c.env.DB, u.id, c.req.param("id"));
  if (t.version !== b.version) throw new ApiError(409, "version_conflict", "This transaction changed elsewhere; reload and retry");
  const edited = new Set<string>(JSON.parse(t.user_edited_fields) as string[]);
  const amount = b.amount !== undefined ? toPaise(b.amount) : t.amount_paise;
  const kind = b.kind ?? t.kind;
  if (kind === "refund" && !t.original_txn_id) throw new ApiError(422, "validation_failed", "Refunds must be linked via the refund endpoint");
  const sets: string[] = ["version = version + 1", "updated_at = ?"];
  const args: unknown[] = [now()];
  const field = (col: string, name: string, v: unknown) => { sets.push(`${col} = ?`); args.push(v); edited.add(name); };
  if (b.amount !== undefined) field("amount_paise", "amount", amount);
  if (b.kind) { field("kind", "kind", b.kind); field("direction", "direction", b.kind === "income" ? "incoming" : b.kind === "unknown" ? "unknown" : "outgoing"); }
  if (b.payment_status) field("payment_status", "payment_status", b.payment_status);
  if (b.effective_local_date) field("occurred_on", "effective_local_date", b.effective_local_date);
  if (b.counterparty !== undefined) field("counterparty", "counterparty", b.counterparty);
  if (b.description !== undefined) field("note", "description", b.description);
  let review = b.review_state;
  if (!review && b.kind && b.kind !== "unknown" && t.review_state === "needs_review") review = "confirmed";
  if (review) field("review_state", "review_state", review);
  sets.push("user_edited_fields = ?"); args.push(JSON.stringify([...edited]));
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`UPDATE transactions SET ${sets.join(", ")} WHERE id = ? AND user_id = ? AND version = ?`).bind(...args, t.id, u.id, b.version),
  ];
  const needNewAllocs = b.allocations || b.category_id || b.amount !== undefined;
  if (needNewAllocs) {
    let allocs: Alloc[];
    if (b.allocations || b.category_id) allocs = buildAllocations(amount, b.allocations, b.category_id);
    else {
      const cur = (await allocationsFor(c.env.DB, u.id, [t.id])).get(t.id) ?? [];
      if (cur.length <= 1) allocs = [{ category: cur[0]?.category ?? "uncategorized", amountPaise: amount }];
      else { const split = allocateProportionally(amount, cur.map((a) => a.amountPaise)); allocs = cur.map((a, i) => ({ category: a.category, amountPaise: split[i]! })); }
    }
    stmts.push(c.env.DB.prepare("DELETE FROM allocations WHERE transaction_id = ? AND user_id = ?").bind(t.id, u.id));
    for (const a of allocs) stmts.push(c.env.DB.prepare("INSERT INTO allocations (id, user_id, transaction_id, category, amount_paise, category_source) VALUES (?,?,?,?,?,'user')").bind(uuid(), u.id, t.id, a.category, a.amountPaise));
    if (b.category_id) edited.add("category");
  }
  if (review || b.category_id) stmts.push(c.env.DB.prepare("DELETE FROM txn_suggestions WHERE user_id = ? AND transaction_id = ?").bind(u.id, t.id));
  if (b.apply_rule && b.category_id && (b.counterparty ?? t.counterparty)) {
    stmts.push(c.env.DB.prepare("INSERT INTO category_rules (id, user_id, match_type, pattern, category, kind, created_at) VALUES (?,?,'counterparty_exact',?,?,?,?) ON CONFLICT(user_id, match_type, pattern) DO UPDATE SET category = excluded.category, kind = excluded.kind")
      .bind(uuid(), u.id, normalizeMerchant((b.counterparty ?? t.counterparty)!), b.category_id, kind, now()));
  }
  const res = await c.env.DB.batch(stmts);
  if ((res[0]?.meta.changes ?? 0) === 0) throw new ApiError(409, "version_conflict", "This transaction changed elsewhere; reload and retry");
  const nt = await loadTxn(c.env.DB, u.id, t.id);
  return c.json({ transaction: present(nt, (await allocationsFor(c.env.DB, u.id, [t.id])).get(t.id) ?? []) });
});

ledger.delete("/transactions/:id", async (c) => {
  const u = c.get("user");
  const t = await loadTxn(c.env.DB, u.id, c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE transactions SET deleted_at = ?, version = version + 1 WHERE id = ? AND user_id = ?").bind(now(), t.id, u.id),
    // Refunds linked to a deleted purchase become unresolved rather than silently counting.
    c.env.DB.prepare("UPDATE transactions SET review_state = 'needs_review', version = version + 1 WHERE original_txn_id = ? AND user_id = ? AND deleted_at IS NULL").bind(t.id, u.id),
  ]);
  return c.json({ ok: true });
});

ledger.post("/transactions/:id/refund", async (c) => {
  const u = c.get("user");
  const b = await parseJson(c, RefundInput);
  if (b.original_transaction_id !== c.req.param("id")) throw new ApiError(422, "validation_failed", "Path and body transaction differ");
  const prior = await c.env.DB.prepare("SELECT id FROM transactions WHERE user_id = ? AND operation_id = ?").bind(u.id, b.operation_id).first<{ id: string }>();
  if (prior) { const t = await loadTxn(c.env.DB, u.id, prior.id); return c.json({ transaction: present(t, (await allocationsFor(c.env.DB, u.id, [t.id])).get(t.id) ?? []), replayed: true }); }
  const orig = await loadTxn(c.env.DB, u.id, b.original_transaction_id);
  if (orig.kind !== "expense") throw new ApiError(422, "validation_failed", "Only expenses can be refunded");
  if (orig.payment_status === "reversed") throw new ApiError(409, "conflict", "This payment was reversed; a refund would double-subtract");
  const amount = toPaise(b.amount);
  const already = await c.env.DB.prepare("SELECT COALESCE(SUM(amount_paise),0) AS s FROM transactions WHERE user_id = ? AND original_txn_id = ? AND kind = 'refund' AND deleted_at IS NULL AND payment_status = 'successful'").bind(u.id, orig.id).first<{ s: number }>();
  if (!refundWithinLimit(orig.amount_paise, already?.s ?? 0, amount)) throw new ApiError(422, "validation_failed", "Refund exceeds the unrefunded amount", false, undefined, { amount: "exceeds_unrefunded" });
  let allocs: Alloc[];
  if (b.allocations?.length) allocs = buildAllocations(amount, b.allocations);
  else {
    const oa = (await allocationsFor(c.env.DB, u.id, [orig.id])).get(orig.id) ?? [{ category: "uncategorized" as CategoryId, amountPaise: orig.amount_paise }];
    const split = allocateProportionally(amount, oa.map((a) => a.amountPaise));
    allocs = oa.map((a, i) => ({ category: a.category, amountPaise: split[i]! })).filter((a) => a.amountPaise > 0);
  }
  const id = uuid();
  await c.env.DB.batch(insertTxnStatements(c.env.DB, id, {
    userId: u.id, kind: "refund", paymentStatus: "successful", reviewState: "confirmed", amountPaise: amount, date: b.effective_local_date, direction: "incoming",
    counterparty: orig.counterparty, note: null, source: "manual", provenance: "manual", operationId: b.operation_id, originalTxnId: orig.id, allocations: allocs,
  }));
  const t = await loadTxn(c.env.DB, u.id, id);
  return c.json({ transaction: present(t, allocs), replayed: false }, 201);
});

export async function monthLedger(db: D1Database, userId: string, month: string): Promise<LedgerTransaction[]> {
  const b = monthBounds(month);
  const rs = await db.prepare("SELECT * FROM transactions WHERE user_id = ? AND deleted_at IS NULL AND merged_into_id IS NULL AND occurred_on >= ? AND occurred_on < ?").bind(userId, b.start, b.endExclusive).all<TxnRow>();
  const allocs = await allocationsFor(db, userId, rs.results.map((r) => r.id));
  return rs.results.map((r) => ({
    id: r.id, amountPaise: r.amount_paise, kind: r.kind as LedgerTransaction["kind"], paymentStatus: r.payment_status as LedgerTransaction["paymentStatus"],
    reviewState: r.review_state as LedgerTransaction["reviewState"], direction: r.direction as LedgerTransaction["direction"], effectiveLocalDate: r.occurred_on, deleted: false,
    allocations: (allocs.get(r.id) ?? []).map((a) => ({ categoryId: a.category, amountPaise: a.amountPaise })),
  }));
}

ledger.get("/summary", async (c) => {
  const q = SummaryQuery.safeParse(c.req.query());
  if (!q.success) throw new ApiError(422, "validation_failed", "month must be YYYY-MM");
  return c.json(summarizeMonth(q.data.month, await monthLedger(c.env.DB, c.get("user").id, q.data.month)));
});

ledger.get("/export.csv", async (c) => {
  const u = c.get("user");
  const rs = await c.env.DB.prepare("SELECT * FROM transactions WHERE user_id = ? AND deleted_at IS NULL ORDER BY occurred_on, id LIMIT 20000").bind(u.id).all<TxnRow>();
  const allocs = await allocationsFor(c.env.DB, u.id, []);
  void allocs;
  const lines = [csvRow(["id", "date", "kind", "payment_status", "review_state", "amount_inr", "counterparty", "description", "source", "categories", "original_transaction_id", "merged_into_id"])];
  for (let i = 0; i < rs.results.length; i += 90) {
    const chunk = rs.results.slice(i, i + 90);
    const am = await allocationsFor(c.env.DB, u.id, chunk.map((r) => r.id));
    for (const r of chunk) {
      lines.push(csvRow([r.id, r.occurred_on, r.kind, r.payment_status, r.review_state, paiseToDecimalString(r.amount_paise), r.counterparty, r.note, r.source,
        (am.get(r.id) ?? []).map((a) => `${a.category}:${paiseToDecimalString(a.amountPaise)}`).join(";"), r.original_txn_id, r.merged_into_id]));
    }
  }
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=tinkerspend-export.csv", "cache-control": "no-store" } });
});

ledger.get("/category-rules", async (c) => {
  const rs = await c.env.DB.prepare("SELECT id, pattern, category, kind, created_at FROM category_rules WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").bind(c.get("user").id).all();
  return c.json({ items: rs.results });
});
ledger.post("/category-rules", async (c) => {
  const b = await parseJson(c, CategoryRuleInput, 4096);
  const id = uuid();
  await c.env.DB.prepare("INSERT INTO category_rules (id, user_id, match_type, pattern, category, kind, created_at) VALUES (?,?,'counterparty_exact',?,?,?,?) ON CONFLICT(user_id, match_type, pattern) DO UPDATE SET category = excluded.category, kind = excluded.kind")
    .bind(id, c.get("user").id, normalizeMerchant(b.counterparty), b.category_id, b.kind, now()).run();
  return c.json({ ok: true }, 201);
});
ledger.delete("/category-rules/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM category_rules WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.get("user").id).run();
  return c.json({ ok: true });
});
