export interface ReceiptFigures {
  totalPaise: number | null;
  lineItemPaise: number[];
  taxesPaise: number[];
  feesPaise: number[];
  discountsPaise: number[];
}

export type ReceiptCheck =
  | { ok: true; computedPaise: number }
  | { ok: false; reason: "missing_total" | "no_line_items" | "mismatch"; computedPaise: number | null; differencePaise?: number };

/** lines + taxes + fees − discounts must equal total exactly (integer paise). */
export function reconcileReceipt(r: ReceiptFigures): ReceiptCheck {
  if (r.totalPaise == null) return { ok: false, reason: "missing_total", computedPaise: null };
  if (r.lineItemPaise.length === 0) return { ok: true, computedPaise: r.totalPaise };
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const computed = sum(r.lineItemPaise) + sum(r.taxesPaise) + sum(r.feesPaise) - sum(r.discountsPaise);
  if (computed !== r.totalPaise) return { ok: false, reason: "mismatch", computedPaise: computed, differencePaise: r.totalPaise - computed };
  return { ok: true, computedPaise: computed };
}
