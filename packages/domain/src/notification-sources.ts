import { combinedText, KNOWN_SOURCES, type NotificationText } from "./notifications";

/** Notification access only; no SMS inbox/read permission. Personal-message titles are rejected. */
export const MESSAGING_SOURCES = new Set(["com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms"]);
const BANK_HEADERS: Record<string, string> = {
  HDFCBK: "HDFC Bank", HDFCBN: "HDFC Bank", ICICIB: "ICICI Bank", SBIINB: "State Bank of India",
  SBIPSG: "State Bank of India", SBIUPI: "State Bank of India", SBIBNK: "State Bank of India",
  AXISBK: "Axis Bank", KOTAKB: "Kotak Mahindra Bank", FEDBNK: "Federal Bank", CANBNK: "Canara Bank",
  BOBTXN: "Bank of Baroda", PNBSMS: "Punjab National Bank", IDFCFB: "IDFC FIRST Bank", IDFCBK: "IDFC FIRST Bank",
  UNIONB: "Union Bank of India", INDUSB: "IndusInd Bank", YESBNK: "YES Bank",
};
export function bankFromSmsHeader(title: string | null | undefined): string | null {
  const header = title?.trim().toUpperCase().match(/^(?:[A-Z]{2}-)?([A-Z]{6})(?:-[SPTG])?$/)?.[1];
  return header ? BANK_HEADERS[header] ?? null : null;
}
export function isSupportedNotificationSource(pkg: string, title?: string | null): boolean {
  return pkg in KNOWN_SOURCES || (MESSAGING_SOURCES.has(pkg) && bankFromSmsHeader(title) !== null);
}
const BANK_APP_NAMES: Record<string, string> = {
  "com.csam.icici.bank.imobile": "ICICI Bank", "com.snapwork.hdfc": "HDFC Bank",
  "com.sbi.lotusintouch": "State Bank of India", "com.axis.mobile": "Axis Bank", "com.msf.kbank.mobile": "Kotak Mahindra Bank",
};
const BANK_NAMES: Array<[RegExp, string]> = [
  [/\bhdfc\s+bank\b/i, "HDFC Bank"], [/\bicici\s+bank\b/i, "ICICI Bank"],
  [/\b(?:sbi|state bank of india)\b/i, "State Bank of India"], [/\baxis\s+bank\b/i, "Axis Bank"],
  [/\bkotak(?:\s+mahindra)?\s+bank\b/i, "Kotak Mahindra Bank"], [/\bfederal\s+bank\b/i, "Federal Bank"],
  [/\bcanara\s+bank\b/i, "Canara Bank"], [/\bbank of baroda\b/i, "Bank of Baroda"],
  [/\bpunjab national bank\b/i, "Punjab National Bank"], [/\bidfc\s+first\s+bank\b/i, "IDFC FIRST Bank"],
];
/** Reported bank, not verified ownership. Multiple conflicting bank names remain unknown. */
export function reportedBank(pkg: string, n: NotificationText): string | null {
  const sourceBank = BANK_APP_NAMES[pkg] ?? (MESSAGING_SOURCES.has(pkg) ? bankFromSmsHeader(n.title) : null);
  const names = new Set(BANK_NAMES.filter(([re]) => re.test(combinedText(n))).map(([, name]) => name));
  if (sourceBank) names.add(sourceBank);
  return names.size === 1 ? [...names][0]! : null;
}
