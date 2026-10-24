import { CATEGORIES, formatINR, localDateOf, DEFAULT_TIMEZONE, type CategoryId } from "@tinkerspend/domain";
export const inr = (p: number) => formatINR(p);
export const categoryName = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.name ?? id;
export const today = (tz = DEFAULT_TIMEZONE) => localDateOf(Date.now(), tz);
export const thisMonth = (tz = DEFAULT_TIMEZONE) => today(tz).slice(0, 7);
export function shiftMonth(m: string, d: number): string {
  const [y = 0, mo = 1] = m.split("-").map(Number); const t = y * 12 + (mo - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const KIND_LABEL: Record<string, string> = { expense: "Expense", income: "Income", transfer: "Transfer", refund: "Refund", unknown: "Unknown" };
export const STATUS_LABEL: Record<string, string> = { pending: "Pending", successful: "Successful", failed: "Failed", reversed: "Reversed", unknown: "Unknown" };
