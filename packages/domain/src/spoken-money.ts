const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const SMALL = [...UNITS, "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: Record<string, number> = { thousand: 1000, lakh: 100000, lakhs: 100000, crore: 10000000, crores: 10000000 };
const WORDS = [...SMALL, ...TENS, "hundred", ...Object.keys(SCALES), "and", "point"];
const RUN = new RegExp(`\\b(?:${WORDS.join("|")})(?:[ -]+(?:${WORDS.join("|")}))*\\b`, "gi");

function belowHundred(words: string[]): number | null {
  if (words.length === 1 && SMALL.includes(words[0]!)) return SMALL.indexOf(words[0]!);
  const tens = TENS.indexOf(words[0]!);
  if (tens < 0 || words.length > 2) return null;
  if (words.length === 1) return (tens + 2) * 10;
  const unit = UNITS.indexOf(words[1]!);
  return unit > 0 ? (tens + 2) * 10 + unit : null;
}

function group(words: string[]): number | null {
  if (words[1] !== "hundred") return belowHundred(words);
  const unit = UNITS.indexOf(words[0]!);
  if (unit < 1) return null;
  let rest = words.slice(2);
  if (rest[0] === "and") rest = rest.slice(1);
  if (!rest.length) return words.length === 2 ? unit * 100 : null;
  const tail = belowHundred(rest);
  return tail !== null && tail > 0 ? unit * 100 + tail : null;
}

/** Strict English/Indian number grammar; malformed or approximate phrases stay unparsed. */
function integer(words: string[]): number | null {
  let total = 0, start = 0, previousScale = Infinity;
  for (let i = 0; i < words.length; i++) {
    const scale = SCALES[words[i]!];
    if (!scale) continue;
    const n = group(words.slice(start, i));
    if (n === null || n === 0 || scale >= previousScale) return null;
    total += n * scale;
    previousScale = scale;
    start = i + 1;
  }
  let rest = words.slice(start);
  if (start > 0 && rest[0] === "and") rest = rest.slice(1);
  if (!rest.length) return start > 0 && start === words.length ? total : null;
  const tail = group(rest);
  if (tail === null || (start > 0 && tail >= previousScale)) return null;
  return total + tail;
}

/**
 * Converts bounded monetary phrases before expense splitting. Single number words
 * require a currency/spending cue; quantity phrases, identifiers and invalid grammar
 * remain untouched. This is exact parsing, not model arithmetic or an accuracy claim.
 */
export function normalizeSpokenMoney(source: string): string {
  return source.replace(RUN, (run: string, offset: number) => {
    let words = run.toLowerCase().split(/[ -]+/);
    // "and" may separate expenses; it is part of a number only inside its grammar.
    let leading = "", trailing = "";
    if (words[0] === "and") { leading = "and "; words = words.slice(1); }
    if (words.at(-1) === "and") { trailing = " and"; words = words.slice(0, -1); }
    const before = source.slice(0, offset);
    const after = source.slice(offset + run.length);
    if (/\b(?:account|card|balance|bal|reference|ref|utr|otp|phone|mobile|ending)(?:\s+(?:number|in|with|is|digits))*\s*[:#]?\s*$/i.test(before)) return run;
    if (/\b(?:about|around|approximately|roughly|between|over|under|minus|negative|more than|less than|up to)\s*$/i.test(before)) return run;
    if (/\bnot\s*$/i.test(before) && !/^\s*,?\s*(?:it was|it's|it is|but|make it|rather|actually)\b/i.test(after)) return run;
    const currency = /^\s*(?:rupees?|rs\b|inr\b)/i.test(after) || /(?:\b(?:rs|inr)|₹)\s*$/i.test(before);
    const spending = /\b(?:paid|spent|cost|costs)\s*$/i.test(before);
    const compound = words.some((w) => w === "hundred" || !!SCALES[w] || TENS.includes(w));
    if (!currency && !spending && !compound) return run;
    if (!currency && !trailing && !/^\s*(?:$|[,;.!]|\b(?:for|on|to|and|plus|also|then|yesterday|today|last)\b)/i.test(after)) return run;
    const point = words.indexOf("point");
    const whole = integer(point < 0 ? words : words.slice(0, point));
    if (whole === null || whole > 99999999) return run;
    let decimal = "";
    if (point >= 0) {
      const digits = words.slice(point + 1);
      if (digits.length < 1 || digits.length > 2 || digits.some((w) => !UNITS.includes(w))) return run;
      decimal = "." + digits.map((w) => UNITS.indexOf(w)).join("");
    }
    return leading + whole + decimal + trailing;
  });
}
