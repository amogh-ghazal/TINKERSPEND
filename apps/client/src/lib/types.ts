import type { CategoryId, Kind, PaymentStatus, ReviewState } from "@tinkerspend/domain";

export interface Txn {
  id: string; kind: Kind; payment_status: PaymentStatus; review_state: ReviewState;
  amount_paise: number; amount: string; effective_local_date: string; direction: string;
  counterparty: string | null; description: string | null; source: string; provenance: string;
  original_transaction_id: string | null; merged_into_id: string | null; user_edited_fields: string[]; version: number;
  allocations: { category_id: CategoryId; amount_paise: number }[]; created_at: number; updated_at: number;
}
export interface Me { id: string; email: string; timezone: string; ai_enabled?: boolean; client?: string }
export interface Summary {
  month: string; grossSpendingPaise: number; refundsPaise: number; netSpendingPaise: number;
  byCategory: { categoryId: CategoryId; spentPaise: number; refundedPaise: number; netPaise: number }[];
  needsReview: { count: number; amountPaise: number }; pending: { count: number; amountPaise: number };
}
