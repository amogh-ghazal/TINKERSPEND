import type { CategoryId, Kind, PaymentStatus, ReviewState } from "./categories";
import { monthBounds } from "./dates";

export interface LedgerAllocation {
  categoryId: CategoryId;
  amountPaise: number;
}

export interface LedgerTransaction {
  id: string;
  amountPaise: number;
  kind: Kind;
  paymentStatus: PaymentStatus;
  reviewState: ReviewState;
  direction: "outgoing" | "incoming" | "unknown";
  effectiveLocalDate: string;
  deleted: boolean;
  allocations: LedgerAllocation[];
}

export interface MonthlySummary {
  month: string;
  grossSpendingPaise: number;
  refundsPaise: number;
  netSpendingPaise: number;
  byCategory: Array<{ categoryId: CategoryId; spentPaise: number; refundedPaise: number; netPaise: number }>;
  needsReview: { count: number; amountPaise: number };
  pending: { count: number; amountPaise: number };
}

export function allocationsValid(t: Pick<LedgerTransaction, "amountPaise" | "allocations">): boolean {
  if (t.allocations.length === 0) return false;
  if (t.allocations.some((a) => !Number.isSafeInteger(a.amountPaise) || a.amountPaise <= 0)) return false;
  return t.allocations.reduce((s, a) => s + a.amountPaise, 0) === t.amountPaise;
}

/**
 * Canonical monthly accounting (mirrors the SQL in apps/api/src/repo/summary.ts).
 * Counted only through allocations; never through the parent total as well.
 */
export function summarizeMonth(month: string, txs: LedgerTransaction[]): MonthlySummary {
  const { start, endExclusive } = monthBounds(month);
  const inMonth = txs.filter((t) => !t.deleted && t.effectiveLocalDate >= start && t.effectiveLocalDate < endExclusive);
  const cat = new Map<CategoryId, { spent: number; refunded: number }>();
  let gross = 0, refunds = 0;
  const nr = { count: 0, amountPaise: 0 };
  const pend = { count: 0, amountPaise: 0 };
  for (const t of inMonth) {
    const confirmedSuccess = t.reviewState === "confirmed" && t.paymentStatus === "successful";
    if (confirmedSuccess && (t.kind === "expense" || t.kind === "refund")) {
      for (const a of t.allocations) {
        const e = cat.get(a.categoryId) ?? { spent: 0, refunded: 0 };
        if (t.kind === "expense") { e.spent += a.amountPaise; gross += a.amountPaise; }
        else { e.refunded += a.amountPaise; refunds += a.amountPaise; }
        cat.set(a.categoryId, e);
      }
      continue;
    }
    if (t.reviewState === "needs_review" && t.direction !== "incoming" && t.paymentStatus !== "failed" && t.paymentStatus !== "pending") {
      nr.count += 1; nr.amountPaise += t.amountPaise;
    }
    if (t.paymentStatus === "pending" && t.reviewState !== "ignored" && t.direction !== "incoming") {
      pend.count += 1; pend.amountPaise += t.amountPaise;
    }
  }
  const byCategory = [...cat.entries()]
    .map(([categoryId, v]) => ({ categoryId, spentPaise: v.spent, refundedPaise: v.refunded, netPaise: v.spent - v.refunded }))
    .sort((a, b) => b.netPaise - a.netPaise || a.categoryId.localeCompare(b.categoryId));
  return { month, grossSpendingPaise: gross, refundsPaise: refunds, netSpendingPaise: gross - refunds, byCategory, needsReview: nr, pending: pend };
}

export type StatusTransition = { allowed: true } | { allowed: false; reason: string };

const STATUS_RANK: Record<PaymentStatus, number> = { unknown: 0, pending: 1, successful: 2, failed: 2, reversed: 3 };

/** Older/weaker evidence never downgrades a newer state. */
export function evaluateStatusTransition(current: PaymentStatus, incoming: PaymentStatus): StatusTransition {
  if (current === incoming) return { allowed: true };
  if (incoming === "unknown") return { allowed: false, reason: "no_status_evidence" };
  if (current === "reversed") return { allowed: false, reason: "already_reversed" };
  if (incoming === "pending" && STATUS_RANK[current] >= 2) return { allowed: false, reason: "stale_pending" };
  if (current === "successful" && incoming === "failed") return { allowed: false, reason: "requires_review" };
  if (incoming === "reversed" && current !== "successful") return { allowed: false, reason: "reversal_without_success" };
  return { allowed: true };
}

/** Partial refunds cannot exceed the unrefunded amount. */
export function refundWithinLimit(originalPaise: number, alreadyRefundedPaise: number, newRefundPaise: number): boolean {
  return newRefundPaise > 0 && alreadyRefundedPaise + newRefundPaise <= originalPaise;
}
