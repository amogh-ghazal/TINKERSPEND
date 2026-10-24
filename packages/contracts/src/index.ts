import { z } from "zod";
import { CATEGORY_IDS, KINDS, PAYMENT_STATUSES, REVIEW_STATES, isValidIsoDate, isValidMonth } from "@tinkerspend/domain";

export const API_VERSION = "v1";

export const LIMITS = {
  textChars: 4000,
  notificationEventBytes: 8 * 1024,
  notificationBatchEvents: 5,
  notificationBatchBytes: 64 * 1024,
  imageBytes: 750 * 1024,
  audioBytes: 3 * 1024 * 1024,
  audioSeconds: 60,
  pageSize: 100,
  receiptLineItems: 60,
} as const;

export const ErrorCode = z.enum([
  "unauthenticated", "forbidden", "not_found", "validation_failed", "conflict", "version_conflict",
  "payload_too_large", "rate_limited", "quota_exceeded", "upstream_unavailable", "outcome_unknown",
  "service_unavailable", "not_allowlisted", "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    retryable: z.boolean(),
    request_id: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const IsoDate = z.string().refine(isValidIsoDate, "invalid date (YYYY-MM-DD)");
export const Month = z.string().refine(isValidMonth, "invalid month (YYYY-MM)");
export const Uuid = z.string().uuid();
export const DecimalAmount = z.string().max(20).regex(/^\d[\d,]*(\.\d{1,2})?$/, "decimal rupee amount");
export const CategoryIdSchema = z.enum(CATEGORY_IDS);
export const KindSchema = z.enum(KINDS);
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const ReviewStateSchema = z.enum(REVIEW_STATES);

// ---- auth
export const ChallengeRequest = z.object({ client: z.enum(["web", "android"]), install_id: z.string().min(8).max(64).optional() });
export const GoogleLoginRequest = z.object({
  challenge_id: Uuid,
  id_token: z.string().min(20).max(4096),
  client: z.enum(["web", "android"]),
  install_id: z.string().min(8).max(64).optional(),
  device_label: z.string().max(60).optional(),
});

// ---- settings
export const SettingsPatch = z.object({
  timezone: z.string().max(64).optional(),
  ai_processing: z.boolean().optional(),
  recalculate_dates: z.literal(false).optional(),
}).strict();

// ---- notifications
export const NotificationEvent = z.object({
  event_id: Uuid,
  source_package: z.string().min(3).max(120).regex(/^[a-zA-Z0-9_.]+$/),
  source_key_hash: z.string().max(128),
  posted_at: z.number().int().positive(),
  captured_at: z.number().int().positive(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  parser_version: z.string().max(20),
  title: z.string().max(500).nullable(),
  text: z.string().max(4000).nullable(),
  is_current_import: z.boolean().default(false),
  timezone: z.string().max(64).optional(),
}).strict();
export type NotificationEvent = z.infer<typeof NotificationEvent>;
export const NotificationBatch = z.object({
  device_install_id: z.string().min(8).max(64),
  events: z.array(NotificationEvent).min(1).max(LIMITS.notificationBatchEvents),
}).strict();
export const NotificationAck = z.object({
  event_id: z.string(),
  status: z.enum(["accepted", "duplicate", "ignored", "rejected"]),
  draft_id: z.string().nullable(),
  transaction_id: z.string().nullable(),
  needs_enrichment: z.boolean(),
  error_code: z.string().nullable(),
});
export type NotificationAck = z.infer<typeof NotificationAck>;

// ---- manual / drafts / transactions
export const AllocationInput = z.object({ category_id: CategoryIdSchema, amount: DecimalAmount });
export const ManualTransactionInput = z.object({
  operation_id: Uuid,
  amount: DecimalAmount,
  kind: KindSchema,
  payment_status: PaymentStatusSchema,
  effective_local_date: IsoDate,
  counterparty: z.string().max(120).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  allocations: z.array(AllocationInput).max(LIMITS.receiptLineItems).optional(),
  category_id: CategoryIdSchema.optional(),
  provenance: z.enum(["manual", "self_reported"]).default("manual"),
}).strict();
export const TransactionPatch = z.object({
  version: z.number().int().positive(),
  amount: DecimalAmount.optional(),
  kind: KindSchema.optional(),
  payment_status: PaymentStatusSchema.optional(),
  review_state: ReviewStateSchema.optional(),
  effective_local_date: IsoDate.optional(),
  counterparty: z.string().max(120).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  allocations: z.array(AllocationInput).max(LIMITS.receiptLineItems).optional(),
  category_id: CategoryIdSchema.optional(),
  apply_rule: z.object({ scope: z.literal("counterparty_exact") }).optional(),
}).strict();
export const RefundInput = z.object({
  operation_id: Uuid,
  original_transaction_id: z.string(),
  amount: DecimalAmount,
  effective_local_date: IsoDate,
  allocations: z.array(AllocationInput).optional(),
}).strict();

export const DraftEntry = z.object({
  amount: DecimalAmount.nullable(),
  currency: z.string().max(5).nullable(),
  effective_local_date: IsoDate.nullable(),
  counterparty: z.string().max(120).nullable(),
  description: z.string().max(500).nullable(),
  kind: KindSchema,
  payment_status: PaymentStatusSchema,
  category_id: CategoryIdSchema.nullable(),
  line_items: z.array(z.object({ description: z.string().max(200), amount: DecimalAmount.nullable(), category_id: CategoryIdSchema.nullable() })).max(LIMITS.receiptLineItems).default([]),
});
export const DraftPatch = z.object({ version: z.number().int().positive(), entry: DraftEntry.partial() }).strict();
export const DraftCommit = z.object({
  operation_id: Uuid,
  version: z.number().int().positive(),
  paid_confirmed: z.boolean(),
  attach_to_transaction_id: z.string().optional(),
}).strict();

export const TextDraftRequest = z.object({
  operation_id: Uuid,
  text: z.string().min(1).max(LIMITS.textChars),
  reference_time: z.number().int().positive(),
  timezone: z.string().max(64).optional(),
}).strict();
export const MediaDraftRequest = z.object({
  operation_id: Uuid,
  reference_time: z.number().int().positive(),
  timezone: z.string().max(64).optional(),
  mime_type: z.string().max(40),
  data_base64: z.string().max(Math.ceil((LIMITS.audioBytes * 4) / 3) + 8),
  duration_ms: z.number().int().positive().max(LIMITS.audioSeconds * 1000 + 500).optional(),
}).strict();

export const ClassifyInput = z.object({ draft_id: Uuid, operation_id: Uuid });
export type ClassifyInput = z.infer<typeof ClassifyInput>;

export const CategoryRuleInput = z.object({
  counterparty: z.string().min(1).max(120),
  category_id: CategoryIdSchema,
  kind: z.enum(["expense", "transfer", "income"]).default("expense"),
}).strict();

export const SummaryQuery = z.object({ month: Month });
export const ListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSize).default(50),
  month: Month.optional(),
  category_id: CategoryIdSchema.optional(),
  kind: KindSchema.optional(),
  q: z.string().max(100).optional(),
});

// ---- AI structured output (shared with API adapter)
export const AI_SCHEMA_VERSION = "ext-1";
export const AiExtraction = z.object({
  schema_version: z.literal(AI_SCHEMA_VERSION),
  entries: z.array(z.object({
    amount_decimal: z.string().nullable(),
    currency: z.enum(["INR", "OTHER"]).nullable(),
    effective_date: z.string().nullable(),
    relative_date_phrase: z.string().nullable(),
    counterparty: z.string().nullable(),
    description: z.string().nullable(),
    proposed_kind: KindSchema,
    proposed_category_id: CategoryIdSchema.nullable(),
    payment_status_evidence: PaymentStatusSchema,
    evidence_excerpt: z.string().nullable(),
    missing_fields: z.array(z.string()),
    ambiguity_reasons: z.array(z.string()),
    subtotal_decimal: z.string().nullable(),
    taxes_decimal: z.array(z.string()),
    fees_decimal: z.array(z.string()),
    discounts_decimal: z.array(z.string()),
    line_items: z.array(z.object({ description: z.string(), amount_decimal: z.string().nullable(), proposed_category_id: CategoryIdSchema.nullable() })),
  })).max(20),
});
export type AiExtraction = z.infer<typeof AiExtraction>;
