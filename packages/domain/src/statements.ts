import { deterministicCategory, type CategoryId } from "./categories";
import { resolveRelativeDate, localDateOf, DEFAULT_TIMEZONE } from "./dates";
import { parseRupeesToPaise } from "./money";

/**
 * Deterministic parser for short typed/spoken expense statements
 * ("Yesterday, lunch 180 and auto 80"). Used as the offline/no-AI path and as a
 * cross-check for AI output. It never guesses: unclear amounts stay null.
 */
export interface StatementDraft {
  amountPaise: number | null;
  description: string | null;
  categoryId: CategoryId | null;
  effectiveLocalDate: string | null;
  datePhrase: string | null;
  currency: string | null;
  assumptions: string[];
}

const NUM = String.raw`\d[\d,]*(?:\.\d{1,2})?`;
const DATE_PHRASES = [
  String.raw`day before yesterday`, String.raw`yesterday`, String.raw`last night`, String.raw`today`, String.raw`tonight`,
  String.raw`this morning`, String.raw`this evening`, String.raw`\d{1,2} days? ago`,
  String.raw`(?:last |on )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)`, String.raw`\d{4}-\d{2}-\d{2}`,
];
const DATE_RE = new RegExp(String.raw`\b(${DATE_PHRASES.join("|")})\b`, "i");

const KEYWORDS: [RegExp, CategoryId][] = [
  [/\b(lunch|dinner|breakfast|snacks?|coffee|tea|chai|juice|food|meal|biryani|pizza|swiggy|zomato|restaurant|cafe)\b/i, "food_drinks"],
  [/\b(groceries|grocery|vegetables?|veggies|fruits?|milk|kirana|bigbasket|blinkit|zepto)\b/i, "groceries"],
  [/\b(auto|rickshaw|cab|taxi|uber|ola|rapido|metro|bus|train|petrol|diesel|fuel|parking|toll)\b/i, "transport"],
  [/\b(rent|electricity|water bill|gas bill|broadband|wifi|internet|recharge|maintenance)\b/i, "housing_bills"],
  [/\b(medicine|medicines|pharmacy|doctor|clinic|hospital|tablets)\b/i, "health"],
  [/\b(movie|movies|netflix|concert|game|games)\b/i, "entertainment"],
  [/\b(books?|course|tuition|fees|stationery)\b/i, "education"],
  [/\b(clothes|shoes|shirt|amazon|flipkart|myntra|shopping)\b/i, "shopping"],
];
const FILLER = /\b(i|we|spent|spend|paid|pay|gave|bought|got|for|on|the|a|an|was|it|of|rs|inr|rupees?|bucks|around|about|approx|only|total|just|my|me)\b/gi;

function stripSensitiveNumbers(s: string): string {
  return s
    .replace(/\b(?:a\/c|ac|acct|account|card|ending(?: with| in)?|last (?:four|4)(?: digits)?)\s*(?:no\.?|number)?\s*[x*]*\d{3,}\b/gi, " ")
    .replace(/\b(?:avl\.?|available)?\s*(?:balance|bal)\s*(?:is|of|:)?\s*(?:rs\.?|inr|₹)?\s*\d[\d,]*(?:\.\d+)?/gi, " ")
    .replace(/\b(?:upi\s*)?(?:ref|reference|utr|txn|transaction id)\s*(?:no\.?|number|id)?\s*:?\s*\w*\d{4,}\w*/gi, " ")
    .replace(/\b\d{9,}\b/g, " ");
}

function applyCorrections(s: string): string {
  let out = s;
  // "180, not 150" is unusual; handle the common "not 150, it was 250" / "150, no, 250" / "150 sorry 250".
  const notX = new RegExp(String.raw`[,;]?\s*\bnot\s+(?:rs\.?\s*)?(${NUM})\s*,?\s*(?:it was|it's|it is|but|make it|rather|actually)\s+(?:rs\.?\s*)?(${NUM})`, "i");
  for (let m = notX.exec(out); m; m = notX.exec(out)) {
    const before = out.slice(0, m.index);
    const idx = before.lastIndexOf(m[1]!);
    out = idx >= 0 ? before.slice(0, idx) + m[2]! + before.slice(idx + m[1]!.length) + out.slice(m.index + m[0].length)
      : before + " " + m[2]! + out.slice(m.index + m[0].length);
  }
  const xNoY = new RegExp(String.raw`(${NUM})\s*,?\s*\b(?:no|sorry|i mean|actually)\b\s*,?\s*(?:rs\.?\s*)?(${NUM})`, "i");
  for (let m = xNoY.exec(out); m; m = xNoY.exec(out)) out = out.slice(0, m.index) + m[2]! + out.slice(m.index + m[0].length);
  return out;
}

function amountsIn(seg: string): string[] {
  const k = [...seg.matchAll(/(\d+(?:\.\d+)?)\s*k\b/gi)].map((m) => String(Math.round(Number(m[1]) * 1000)));
  const plain = [...seg.replace(/(\d+(?:\.\d+)?)\s*k\b/gi, " ").matchAll(new RegExp(String.raw`(?<![\w.])(${NUM})(?![\w])`, "g"))].map((m) => m[1]!);
  return [...k, ...plain];
}

function describe(seg: string): string | null {
  const d = seg.replace(/(\d+(?:\.\d+)?)\s*k\b/gi, " ").replace(new RegExp(NUM, "g"), " ").replace(/[₹$]/g, " ").replace(/\/-/g, " ")
    .replace(FILLER, " ").replace(/[^\p{L}\p{N}&'\- ]/gu, " ").replace(/\s+/g, " ").trim();
  return d ? d.slice(0, 120) : null;
}

export function categoryForDescription(description: string | null): CategoryId | null {
  if (!description) return null;
  for (const [re, cat] of KEYWORDS) if (re.test(description)) return cat;
  return deterministicCategory(description);
}

export function parseExpenseStatement(text: string, referenceUtcMs: number, timeZone: string = DEFAULT_TIMEZONE): StatementDraft[] {
  const refDate = localDateOf(referenceUtcMs, timeZone);
  let s = ` ${text.replace(/\s+/g, " ")} `;
  const foreign = /\$|\b(usd|dollars?|euros?|eur|gbp|pounds?)\b/i.test(s) ? (/\b(eur|euros?)\b/i.test(s) ? "EUR" : /\b(gbp|pounds?)\b/i.test(s) ? "GBP" : "USD") : null;
  s = applyCorrections(stripSensitiveNumbers(s.replace(/₹\s*/g, "rs ")));
  const segs = s.split(/\s*(?:;|(?<!\d),|,(?!\d)|\band\b|\bplus\b|\balso\b|\bthen\b|\.\s)\s*/i).map((x) => x.trim()).filter(Boolean);

  const drafts: StatementDraft[] = [];
  let datePhrase: string | null = null;
  let pendingDesc: string | null = null;
  const push = (amount: string | null, desc: string | null, extra: string[] = []) => {
    const assumptions = [...extra];
    let amountPaise: number | null = null;
    if (amount) { const p = parseRupeesToPaise(amount); if (p.ok) amountPaise = p.paise; else assumptions.push("amount_unclear"); }
    else if (!extra.includes("multiple_amounts")) assumptions.push("amount_missing");
    let date: string | null = refDate;
    if (datePhrase) { date = resolveRelativeDate(datePhrase, referenceUtcMs, timeZone); if (!date) assumptions.push("date_unclear"); }
    else assumptions.push("date_assumed_reference_day");
    if (foreign) { assumptions.push("non_inr_currency"); amountPaise = null; }
    drafts.push({ amountPaise, description: desc, categoryId: categoryForDescription(desc), effectiveLocalDate: date, datePhrase, currency: foreign ?? "INR", assumptions });
  };

  for (let seg of segs) {
    const dm = DATE_RE.exec(seg);
    if (dm) { datePhrase = dm[1]!.toLowerCase().replace(/^on /, ""); seg = seg.replace(DATE_RE, " "); }
    const amts = amountsIn(seg);
    const desc = describe(seg);
    if (amts.length > 1) { push(null, desc ?? pendingDesc, ["multiple_amounts"]); pendingDesc = null; continue; }
    if (amts.length === 1) {
      if (desc) { if (pendingDesc) push(null, pendingDesc); push(amts[0]!, desc); pendingDesc = null; }
      else if (pendingDesc) { push(amts[0]!, pendingDesc); pendingDesc = null; }
      else push(amts[0]!, null);
      continue;
    }
    if (desc) { if (pendingDesc) push(null, pendingDesc); pendingDesc = desc; }
  }
  if (pendingDesc) push(null, pendingDesc);
  return drafts.slice(0, 10);
}
