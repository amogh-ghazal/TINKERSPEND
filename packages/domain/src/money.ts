export const MAX_AMOUNT_PAISE = 10_000_000_00; // ₹1 crore default sensible input ceiling

export type MoneyParseError =
  | "empty"
  | "invalid_format"
  | "too_many_decimals"
  | "negative"
  | "zero"
  | "out_of_range";

export type MoneyParseResult =
  | { ok: true; paise: number }
  | { ok: false; error: MoneyParseError };

const INDIAN_GROUPED = /^\d{1,2}(,\d{2})*,\d{3}$/;
const WESTERN_GROUPED = /^\d{1,3}(,\d{3})+$/;
const PLAIN = /^\d+$/;

/**
 * Strict decimal-string → integer paise. No floating point is used.
 * Accepts "1,23,456.78", "123456.78", "₹ 180", "Rs.80", "INR 2,000.00".
 */
export function parseRupeesToPaise(
  input: string,
  opts: { allowZero?: boolean; maxPaise?: number } = {},
): MoneyParseResult {
  let s = input.trim();
  if (!s) return { ok: false, error: "empty" };
  s = s.replace(/^(₹|rs\.?|inr)\s*/i, "").trim();
  if (s.startsWith("-")) return { ok: false, error: "negative" };
  if (s.startsWith("+")) s = s.slice(1);
  const m = /^([\d,]+)(?:\.(\d*))?$/.exec(s);
  if (!m) return { ok: false, error: "invalid_format" };
  const intPart = m[1]!;
  const frac = m[2] ?? "";
  if (intPart.includes(",")) {
    if (!INDIAN_GROUPED.test(intPart) && !WESTERN_GROUPED.test(intPart)) {
      return { ok: false, error: "invalid_format" };
    }
  } else if (!PLAIN.test(intPart)) {
    return { ok: false, error: "invalid_format" };
  }
  if (frac.length > 2) {
    if (/^\d{2}0+$/.test(frac)) {
      // trailing zeros beyond paise are harmless ("12.500")
    } else {
      return { ok: false, error: "too_many_decimals" };
    }
  }
  const digits = intPart.replace(/,/g, "");
  if (digits.length > 12) return { ok: false, error: "out_of_range" };
  const fracPaise = (frac + "00").slice(0, 2);
  const paise = Number(digits) * 100 + Number(fracPaise);
  if (!Number.isSafeInteger(paise)) return { ok: false, error: "out_of_range" };
  if (paise === 0 && !opts.allowZero) return { ok: false, error: "zero" };
  if (paise > (opts.maxPaise ?? MAX_AMOUNT_PAISE)) return { ok: false, error: "out_of_range" };
  return { ok: true, paise };
}

export function paiseToDecimalString(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new Error("paise must be a safe integer");
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  return `${neg ? "-" : ""}${r}.${p.toString().padStart(2, "0")}`;
}

/** Indian digit grouping: 1,23,45,678.90 */
export function formatINR(paise: number): string {
  const neg = paise < 0;
  const [r, p] = paiseToDecimalString(Math.abs(paise)).split(".") as [string, string];
  let grouped = r;
  if (r.length > 3) {
    const last3 = r.slice(-3);
    const rest = r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  return `${neg ? "-" : ""}₹${grouped}.${p}`;
}

/**
 * Split an integer amount across weights using largest-remainder.
 * Remainder paise go to the largest fractional parts, ties to the earliest index.
 */
export function allocateProportionally(totalPaise: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) throw new Error("invalid total");
  if (weights.length === 0) return [];
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new Error("weights must be non-negative integers");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new Error("weights sum to zero");
  const base = weights.map((w) => Math.floor((w * totalPaise) / sum));
  const rem = weights.map((w, i) => ({ i, r: (w * totalPaise) % sum }));
  let left = totalPaise - base.reduce((a, b) => a + b, 0);
  rem.sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of rem) {
    if (left <= 0) break;
    base[i]! += 1;
    left -= 1;
  }
  return base;
}
