import { Hono } from "hono";
import { NotificationBatch, type NotificationAck, type NotificationEvent, LIMITS } from "@tinkerspend/contracts";
import { parsePaymentNotification, FIXTURE_SOURCE_PACKAGE, localDateOf, isValidTimeZone, strongMatch, evaluateStatusTransition, looksLikePersonName, type PaymentStatus } from "@tinkerspend/domain";
import type { AppVars, AuthedUser, Env } from "./env";
import { ApiError, now, parseJson, uuid } from "./util";
import { applyRules, insertTxnStatements } from "./ledger";
import { isSupportedNotificationSource, reportedBank } from "@tinkerspend/domain";

export const ingest = new Hono<AppVars>();

ingest.post("/notifications/batch", async (c) => {
  const u = c.get("user");
  if (u.client !== "android" || !u.deviceId) throw new ApiError(403, "forbidden", "Notification upload requires a registered Android device session");
  const body = await parseJson(c, NotificationBatch, LIMITS.notificationBatchBytes);
  const dev = await c.env.DB.prepare("SELECT install_id FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL").bind(u.deviceId, u.id).first<{ install_id: string }>();
  if (!dev || dev.install_id !== body.device_install_id) throw new ApiError(403, "forbidden", "Device mismatch");
  const acks: NotificationAck[] = [];
  for (const e of body.events) acks.push(await ingestOne(c.env, u, e));
  await c.env.DB.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").bind(now(), u.deviceId).run();
  return c.json({ acks });
});

function allowedSource(env: Env, pkg: string, title: string | null) {
  return isSupportedNotificationSource(pkg, title) || (pkg === FIXTURE_SOURCE_PACKAGE && env.APP_ENV !== "production");
}

export async function ingestOne(env: Env, u: AuthedUser, e: NotificationEvent): Promise<NotificationAck> {
  const db = env.DB;
  const base = { event_id: e.event_id, draft_id: null, transaction_id: null, needs_enrichment: false, error_code: null };
  // Exact replay of the same event_id (client retry after lost ack).
  const replay = await db.prepare("SELECT outcome, transaction_id, draft_id FROM source_events WHERE user_id = ? AND event_id = ?").bind(u.id, e.event_id).first<{ outcome: string; transaction_id: string | null; draft_id: string | null }>();
  if (replay) return { ...base, status: "duplicate", transaction_id: replay.transaction_id, draft_id: replay.draft_id };
  if (!allowedSource(env, e.source_package, e.title)) return { ...base, status: "rejected", error_code: "unsupported_source" };
  const record = (outcome: string, txnId: string | null) =>
    db.prepare("INSERT INTO source_events (id, user_id, device_id, event_id, source_package, content_hash, posted_at, parser_version, outcome, transaction_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id, event_id) DO NOTHING")
      .bind(uuid(), u.id, u.deviceId, e.event_id, e.source_package, e.content_hash, e.posted_at, e.parser_version, outcome, txnId, now());
  // Same content from the same source at the same notification time = repeated callback/repost.
  const same = await db.prepare("SELECT transaction_id FROM source_events WHERE user_id = ? AND source_package = ? AND content_hash = ? AND posted_at = ? LIMIT 1")
    .bind(u.id, e.source_package, e.content_hash, e.posted_at).first<{ transaction_id: string | null }>();
  if (same) { await record("duplicate_content", same.transaction_id).run(); return { ...base, status: "duplicate", transaction_id: same.transaction_id }; }

  const parsed = parsePaymentNotification({ title: e.title, text: e.text });
  if (parsed.type === "ignored") { await record(`ignored_${parsed.reason}`, null).run(); return { ...base, status: "ignored" }; }

  const tz = e.timezone && isValidTimeZone(e.timezone) ? e.timezone : u.timezone;
  const date = localDateOf(e.posted_at, tz);
  const bank = reportedBank(e.source_package, { title: e.title, text: e.text });
  const kind = parsed.status === "reversed" ? "expense" : parsed.kindHint;
  const direction = parsed.direction === "debit" ? "outgoing" : parsed.direction === "credit" ? "incoming" : "unknown";

  // Status update / reversal for an existing transaction with the same namespaced reference and amount.
  if (parsed.reference) {
    const cands = await db.prepare(
      `SELECT t.id, t.amount_paise, t.occurred_on, t.counterparty, t.kind, t.direction, t.payment_status, t.version, t.user_edited_fields FROM txn_refs r JOIN transactions t ON t.id = r.transaction_id
        WHERE r.user_id = ? AND r.namespace = ? AND r.value = ? AND t.deleted_at IS NULL`,
    ).bind(u.id, parsed.reference.namespace, parsed.reference.value).all<{ id: string; amount_paise: number; occurred_on: string; counterparty: string | null; kind: string; direction: string; payment_status: PaymentStatus; version: number; user_edited_fields: string }>();
    // A credit and debit can share a reference on a user's own-account transfer. Preserve both legs.
    const compatible = cands.results.filter((r) => parsed.status === "reversed" || r.direction === direction || r.direction === "unknown" || direction === "unknown");
    const sameAmount = compatible.filter((r) => r.amount_paise === parsed.amountPaise);
    if (sameAmount.length > 1) parsed.ambiguity.push("reference_collision");
    // Classification can change after a user explains a payment; it is not a second payment.
    const hit = sameAmount.length === 1 ? strongMatch(
      { amountPaise: parsed.amountPaise, effectiveLocalDate: date, counterparty: parsed.counterparty, kind: sameAmount[0]!.kind, reference: parsed.reference },
      compatible.map((r) => ({ id: r.id, amountPaise: r.amount_paise, effectiveLocalDate: r.occurred_on, counterparty: r.counterparty, kind: r.kind, references: [parsed.reference!] })),
    ) : null;
    if (hit) {
      const row = cands.results.find((r) => r.id === hit.id)!;
      if (kind !== "unknown" && row.kind !== "unknown" && kind !== row.kind && !(JSON.parse(row.user_edited_fields) as string[]).includes("kind")) {
        await db.prepare("UPDATE transactions SET review_state = 'needs_review', version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?")
          .bind(now(), row.id, u.id).run();
      }
      // Fill missing reported metadata from a duplicate bank alert; never replace established facts.
      const bankConflict = "(reported_bank IS NOT NULL AND ?1 IS NOT NULL AND reported_bank != ?1)";
      const alreadyConflicted = `instr(capture_warnings, '"bank_conflict"') > 0`;
      await db.prepare(`UPDATE transactions SET
        reported_bank = CASE WHEN ${alreadyConflicted} OR ${bankConflict} THEN NULL ELSE COALESCE(reported_bank, ?1) END,
        capture_warnings = CASE WHEN ${bankConflict} AND NOT (${alreadyConflicted}) THEN json_insert(capture_warnings, '$[#]', 'bank_conflict') ELSE capture_warnings END,
        review_state = CASE WHEN ${bankConflict} THEN 'needs_review' ELSE review_state END,
        notification_posted_at = COALESCE(notification_posted_at, ?2), version = version + 1, updated_at = ?3 WHERE id = ?4 AND user_id = ?5`)
        .bind(bank, e.posted_at, now(), row.id, u.id).run();
      const tr = evaluateStatusTransition(row.payment_status, parsed.status);
      const userLocked = (JSON.parse(row.user_edited_fields) as string[]).includes("payment_status");
      if (tr.allowed && row.payment_status !== parsed.status && !userLocked) {
        await db.batch([db.prepare("UPDATE transactions SET payment_status = ?, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?").bind(parsed.status, now(), row.id, u.id), record("status_update", row.id)]);
      } else if (!tr.allowed && tr.reason === "requires_review") {
        await db.batch([db.prepare("UPDATE transactions SET review_state = 'needs_review', version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?").bind(now(), row.id, u.id), record("conflicting_status", row.id)]);
      } else {
        await record("same_reference", row.id).run();
      }
      return { ...base, status: "duplicate", transaction_id: row.id };
    }
  }

  // Without a shared reference, matching alerts are suggestions only. Never silently discard two real payments.
  if (!parsed.reference && parsed.counterparty && direction !== "unknown") {
    const possible = await db.prepare(`SELECT id FROM transactions WHERE user_id = ? AND amount_paise = ? AND direction = ?
      AND source = 'notification' AND notification_posted_at BETWEEN ? AND ? AND LOWER(counterparty) = LOWER(?)
      AND deleted_at IS NULL AND review_state != 'ignored' LIMIT 1`)
      .bind(u.id, parsed.amountPaise, direction, e.posted_at - 120_000, e.posted_at + 120_000, parsed.counterparty).first();
    if (possible) parsed.ambiguity.push("possible_duplicate");
  }
  // New transaction. Unknown kind or personal-looking counterparties stay in review; nothing is guessed into spending.
  let category = null as Awaited<ReturnType<typeof applyRules>>;
  if (kind === "expense" || kind === "unknown") category = await applyRules(db, u.id, parsed.counterparty);
  const resolvedKind = kind === "unknown" && category?.kind ? category.kind : kind === "unknown" && category?.source === "merchant_map" && direction === "outgoing" ? "expense" : kind;
  const review = resolvedKind === "unknown" || resolvedKind === "refund" || parsed.ambiguity.length > 0 || (resolvedKind === "expense" && looksLikePersonName(parsed.counterparty) && !category) ? "needs_review" : "confirmed";
  const txnId = uuid();
  const stmts = insertTxnStatements(db, txnId, {
    userId: u.id, kind: resolvedKind, paymentStatus: parsed.status, reviewState: review, amountPaise: parsed.amountPaise, date, direction,
    counterparty: parsed.counterparty, note: null, source: "notification", provenance: "notification", operationId: null,
    allocations: [{ category: resolvedKind === "expense" ? (category?.category ?? "uncategorized") : "uncategorized", amountPaise: parsed.amountPaise }],
    categorySource: category?.source ?? "default",
    notificationPostedAt: e.posted_at, reportedBank: bank,
    captureWarnings: parsed.ambiguity,
  });
  if (parsed.reference) stmts.push(db.prepare("INSERT INTO txn_refs (user_id, namespace, value, transaction_id) VALUES (?,?,?,?) ON CONFLICT DO NOTHING").bind(u.id, parsed.reference.namespace, parsed.reference.value, txnId));
  stmts.push(record(e.is_current_import ? "created_import" : "created", txnId));
  await db.batch(stmts);
  const needsEnrichment = u.aiEnabled && resolvedKind === "expense" && !category && review === "confirmed";
  return { ...base, status: "accepted", transaction_id: txnId, needs_enrichment: needsEnrichment, draft_id: needsEnrichment ? txnId : null };
}
