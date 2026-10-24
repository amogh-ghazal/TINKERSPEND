import { parseRupeesToPaise } from "./money";
import type { Kind, PaymentStatus } from "./categories";

export const NOTIFICATION_PARSER_VERSION = "np-1";

/** Packages verified from official store metadata. The fixture harness is never trusted in production. */
export const KNOWN_SOURCES: Record<string, { label: string; kind: "upi_app" | "bank" }> = {
  "com.google.android.apps.nbu.paisa.user": { label: "Google Pay", kind: "upi_app" },
  "com.phonepe.app": { label: "PhonePe", kind: "upi_app" },
  "net.one97.paytm": { label: "Paytm", kind: "upi_app" },
  "in.org.npci.upiapp": { label: "BHIM", kind: "upi_app" },
  "com.csam.icici.bank.imobile": { label: "ICICI iMobile", kind: "bank" },
  "com.snapwork.hdfc": { label: "HDFC Bank", kind: "bank" },
  "com.sbi.lotusintouch": { label: "SBI YONO", kind: "bank" },
  "com.axis.mobile": { label: "Axis Mobile", kind: "bank" },
  "com.msf.kbank.mobile": { label: "Kotak", kind: "bank" },
};
export const FIXTURE_SOURCE_PACKAGE = "in.tinkercraft.tinkerspend.fixture";

export interface NotificationText {
  title?: string | null;
  text?: string | null;
  bigText?: string | null;
  lines?: string[] | null;
}

export type ParseOutcome =
  | { type: "ignored"; reason: "otp" | "promotion" | "balance_only" | "no_amount" | "login" | "request" | "empty" }
  | {
      type: "payment";
      amountPaise: number;
      direction: "debit" | "credit" | "unknown";
      status: PaymentStatus;
      kindHint: Kind;
      counterparty: string | null;
      reference: { namespace: string; value: string } | null;
      ambiguity: string[];
    };

export function combinedText(n: NotificationText): string {
  const parts = [n.title, n.bigText ?? n.text, ...(n.lines ?? [])].filter((x): x is string => !!x && !!x.trim());
  // dedupe identical fragments (text often repeated in bigText)
  return [...new Set(parts.map((p) => p.trim()))].join(" \n ");
}

const AMOUNT_RE = /(?:₹|\brs\.?|\binr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
const OTP_RE = /\b(otp|one[- ]time password|verification code|do not share)\b/i;
const LOGIN_RE = /\b(logged in|login|new device|sign[- ]?in)\b/i;
const PROMO_RE = /\b(cashback offer|win up to|get up to|offer ends|limited time|apply now|pre-?approved|loan offer|upto \d+% off|scratch card|refer and earn|coupon)\b/i;
const BALANCE_RE = /\b(avl\.? ?bal|available balance|a\/c balance|balance is|bal:)\b/i;
const REQUEST_RE = /\b(requested|request(?:ing)? money|collect request|is requesting)\b/i;
const DEBIT_RE = /\b(paid|sent|debited|spent|payment of|paying|transferred to|withdrawn|purchase)\b/i;
const CREDIT_RE = /\b(received|credited|deposited|added to)\b/i;
const REFUND_RE = /\b(refund(?:ed)?|reversed|reversal)\b/i;
const FAILED_RE = /\b(failed|declined|unsuccessful|could not be completed)\b/i;
const PENDING_RE = /\b(pending|processing|in progress|awaiting)\b/i;
const SUCCESS_RE = /\b(successful(?:ly)?|success|completed|paid|sent|debited|credited|received)\b/i;
const SELF_TRANSFER_RE = /\b(self transfer|own account|to self|your (?:\w+ )?account ending)\b/i;
const CASH_RE = /\b(atm|cash withdrawal|withdrawn)\b/i;
const WALLET_RE = /\b(wallet top[- ]?up|added to (?:your )?wallet|upi lite)\b/i;
const CARD_REPAY_RE = /\b(credit card (?:bill|payment)|card bill)\b/i;

const REF_PATTERNS: Array<{ ns: string; re: RegExp }> = [
  { ns: "upi_ref", re: /\bupi\s*(?:ref(?:erence)?|txn|transaction)?\s*(?:no\.?|id|#|:)?\s*:?\s*(\d{12})\b/i },
  { ns: "utr", re: /\butr\s*(?:no\.?|:|#)?\s*:?\s*([A-Z0-9]{12,22})\b/i },
  { ns: "txn_id", re: /\b(?:txn|transaction)\s*id\s*:?\s*([A-Z0-9]{8,30})\b/i },
];

function extractCounterparty(t: string, direction: "debit" | "credit" | "unknown"): string | null {
  const patterns =
    direction === "credit"
      ? [/\bfrom\s+([A-Za-z0-9&.' -]{2,40}?)(?=\s+(?:on|via|to|for|ref|upi|using|is|was|has|successful|pending|failed|completed)\b|[.,\n]|$)/i]
      : [
          /\b(?:paid|sent|transferred)\s+(?:₹\s*[\d,.]+|rs\.?\s*[\d,.]+)?\s*to\s+([A-Za-z0-9&.' -]{2,40}?)(?=\s+(?:on|via|from|for|ref|upi|using|is|was|has|successful|pending|failed|completed)\b|[.,\n]|$)/i,
          /\bto\s+([A-Za-z0-9&.' -]{2,40}?)(?=\s+(?:on|via|from|for|ref|upi|using|is|was|has|successful|pending|failed|completed)\b|[.,\n]|$)/i,
          /\bat\s+([A-Za-z0-9&.' -]{2,40}?)(?=\s+(?:on|via|from|for|ref|upi|using|is|was|has|successful|pending|failed|completed)\b|[.,\n]|$)/i,
        ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m?.[1]) {
      const c = m[1].trim().replace(/\s+/g, " ");
      if (c && !/^(your|a\/c|account|bank|xx)/i.test(c)) return c;
    }
  }
  return null;
}

/**
 * Deterministic parser. Amount candidates adjacent to a currency marker only;
 * balances, account suffixes and reference numbers are excluded.
 */
export function parsePaymentNotification(n: NotificationText): ParseOutcome {
  const t = combinedText(n);
  if (!t) return { type: "ignored", reason: "empty" };
  if (OTP_RE.test(t)) return { type: "ignored", reason: "otp" };
  if (PROMO_RE.test(t)) return { type: "ignored", reason: "promotion" };
  if (REQUEST_RE.test(t) && !/\bpaid\b/i.test(t)) return { type: "ignored", reason: "request" };
  if (LOGIN_RE.test(t) && !DEBIT_RE.test(t) && !CREDIT_RE.test(t)) return { type: "ignored", reason: "login" };

  const candidates: Array<{ paise: number; index: number }> = [];
  for (const m of t.matchAll(AMOUNT_RE)) {
    const before = t.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (BALANCE_RE.test(before)) continue;
    const r = parseRupeesToPaise(m[1]!.replace(/\.$/, ""));
    if (r.ok) candidates.push({ paise: r.paise, index: m.index ?? 0 });
  }
  const hasDebit = DEBIT_RE.test(t);
  const hasCredit = CREDIT_RE.test(t);
  if (candidates.length === 0) {
    return { type: "ignored", reason: BALANCE_RE.test(t) ? "balance_only" : "no_amount" };
  }
  if (!hasDebit && !hasCredit && !REFUND_RE.test(t) && BALANCE_RE.test(t)) return { type: "ignored", reason: "balance_only" };

  const ambiguity: string[] = [];
  const distinct = [...new Set(candidates.map((c) => c.paise))];
  if (distinct.length > 1) ambiguity.push("multiple_amounts");
  const amountPaise = candidates[0]!.paise;

  let direction: "debit" | "credit" | "unknown" = "unknown";
  const isRefund = REFUND_RE.test(t);
  if (isRefund) direction = "credit";
  else if (hasDebit && !hasCredit) direction = "debit";
  else if (hasCredit && !hasDebit) direction = "credit";
  else if (hasDebit && hasCredit) {
    // "debited ... credited to X": treat by first keyword
    const di = t.search(DEBIT_RE), ci = t.search(CREDIT_RE);
    direction = di <= ci ? "debit" : "credit";
    ambiguity.push("mixed_direction_words");
  }

  let status: PaymentStatus = "unknown";
  if (FAILED_RE.test(t)) status = "failed";
  else if (/\breversed|reversal\b/i.test(t)) status = "reversed";
  else if (PENDING_RE.test(t)) status = "pending";
  else if (SUCCESS_RE.test(t)) status = "successful";

  let kindHint: Kind = "unknown";
  if (isRefund && !/\breversed|reversal\b/i.test(t)) kindHint = "refund";
  else if (direction === "credit") kindHint = "income";
  else if (direction === "debit") {
    if (SELF_TRANSFER_RE.test(t) || CASH_RE.test(t) || WALLET_RE.test(t) || CARD_REPAY_RE.test(t)) {
      kindHint = "transfer";
      if (CASH_RE.test(t)) ambiguity.push("cash_withdrawal");
      if (WALLET_RE.test(t)) ambiguity.push("wallet_top_up");
      if (CARD_REPAY_RE.test(t)) ambiguity.push("card_repayment");
    } else kindHint = "unknown"; // a debit is not automatically an expense
  }

  let reference: { namespace: string; value: string } | null = null;
  for (const p of REF_PATTERNS) {
    const m = p.re.exec(t);
    if (m?.[1]) {
      reference = { namespace: p.ns, value: m[1].toUpperCase() };
      break;
    }
  }
  return {
    type: "payment",
    amountPaise,
    direction,
    status,
    kindHint,
    counterparty: extractCounterparty(t, direction),
    reference,
    ambiguity,
  };
}

/** Heuristic for a person name vs. a merchant: 2–3 capitalised alphabetic words without business words. */
export function looksLikePersonName(s: string | null): boolean {
  if (!s) return false;
  if (/\b(stores?|marts?|cafe|restaurants?|services|pvt|ltd|limited|enterprises|traders|foods?|pharmacy|medicals?|petrol|fuels?|bank|technologies|india|retail|shops?|hotels?|bakery|bakers|agency|centre|center|supermarket)\b/i.test(s)) return false;
  const words = s.trim().split(/\s+/);
  return words.length >= 1 && words.length <= 3 && words.every((w) => /^[A-Za-z][a-z.']*$/.test(w) || /^[A-Z]\.?$/.test(w));
}
