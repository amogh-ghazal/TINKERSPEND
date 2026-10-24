export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= dim && y >= 2000 && y <= 2100;
}

export function isValidMonth(s: string): boolean {
  const m = MONTH.exec(s);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** Local calendar date (YYYY-MM-DD) of a UTC instant in the given zone. */
export function localDateOf(utcMs: number, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(isoDate: string, days: number): string {
  const m = ISO_DATE.exec(isoDate);
  if (!m) throw new Error("invalid date");
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Inclusive start / exclusive end local dates for a YYYY-MM month. */
export function monthBounds(month: string): { start: string; endExclusive: string } {
  const m = MONTH.exec(month);
  if (!m) throw new Error("invalid month");
  const y = Number(m[1]), mo = Number(m[2]);
  const start = `${m[1]}-${m[2]}-01`;
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return { start, endExclusive: `${ny}-${String(nm).padStart(2, "0")}-01` };
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Resolve simple relative date phrases against the capture reference instant
 * in the user's zone. Returns null when the phrase is not recognised.
 */
export function resolveRelativeDate(
  phrase: string,
  referenceUtcMs: number,
  timeZone: string = DEFAULT_TIMEZONE,
): string | null {
  const p = phrase.trim().toLowerCase();
  const today = localDateOf(referenceUtcMs, timeZone);
  if (p === "today" || p === "tonight" || p === "this morning" || p === "this evening") return today;
  if (p === "yesterday" || p === "last night") return addDays(today, -1);
  if (p === "day before yesterday") return addDays(today, -2);
  const ago = /^(\d{1,2}) days? ago$/.exec(p);
  if (ago) return addDays(today, -Number(ago[1]));
  const wd = /^(last )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(p);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]!);
    const [y, mo, d] = today.split("-").map(Number) as [number, number, number];
    const cur = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    let diff = (cur - target + 7) % 7;
    if (diff === 0) diff = 7;
    return addDays(today, -diff);
  }
  if (isValidIsoDate(p)) return p;
  return null;
}
