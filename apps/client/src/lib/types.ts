import type { CategoryId, Kind, PaymentStatus, ReviewState } from "@tinkerspend/domain";

export interface Txn {
  id: string; kind: Kind; payment_status: PaymentStatus; review_state: ReviewState;
  amount_paise: number; amount: string; effective_local_date: string; direction: string;
  counterparty: string | null; description: string | null; source: string; provenance: string;
  original_transaction_id: string | null; merged_into_id: string | null; user_edited_fields: string[]; version: number;
  allocations: { category_id: CategoryId; amount_paise: number }[]; created_at: number; updated_at: number;
  suggestion: { category_id: CategoryId; kind: "expense" | "transfer" | "unknown"; reason: string | null; model: string } | null;
}
export interface Me { id: string; email: string; timezone: string; ai_enabled?: boolean; client?: string }
export interface Summary {
  month: string; grossSpendingPaise: number; refundsPaise: number; netSpendingPaise: number;
  byCategory: { categoryId: CategoryId; spentPaise: number; refundedPaise: number; netPaise: number }[];
  needsReview: { count: number; amountPaise: number }; pending: { count: number; amountPaise: number };
}

export interface DraftEntry {
  amount: string | null; currency: string | null; effective_local_date: string | null; counterparty: string | null; description: string | null;
  kind: "expense" | "income" | "transfer" | "refund" | "unknown"; payment_status: "successful" | "pending" | "failed" | "unknown"; category_id: CategoryId | null;
  line_items: { description: string; amount: string | null; category_id: CategoryId | null }[];
}
export interface Draft {
  id: string; source: "text" | "voice" | "receipt"; status: string; version: number; reference_at: number; timezone: string;
  entry: DraftEntry; assumptions: string[]; extraction: "ai" | "deterministic"; input_text: string | null; transcript: string | null;
}
