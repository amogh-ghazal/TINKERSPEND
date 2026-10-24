export const CATEGORIES = [
  { id: "food_drinks", name: "Food & drinks", definition: "Prepared meals, cafés, restaurant orders" },
  { id: "groceries", name: "Groceries", definition: "Food ingredients and grocery purchases" },
  { id: "transport", name: "Transport", definition: "Auto, taxi, bus, train and fuel" },
  { id: "housing_bills", name: "Housing & bills", definition: "Rent, electricity, water, internet and phone bills" },
  { id: "shopping", name: "Shopping", definition: "Clothing, electronics and general goods" },
  { id: "health", name: "Health", definition: "Medicines and health-related expenses" },
  { id: "education", name: "Education", definition: "Books, courses and education fees" },
  { id: "entertainment", name: "Entertainment", definition: "Movies, games and entertainment subscriptions" },
  { id: "household", name: "Household", definition: "Cleaning and household consumables" },
  { id: "other", name: "Other", definition: "User-confirmed expense outside the named groups" },
  { id: "uncategorized", name: "Uncategorized", definition: "Expense is confirmed but category remains unresolved" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export function isCategoryId(s: unknown): s is CategoryId {
  return typeof s === "string" && (CATEGORY_IDS as readonly string[]).includes(s);
}

export const KINDS = ["expense", "income", "transfer", "refund", "unknown"] as const;
export type Kind = (typeof KINDS)[number];
export const PAYMENT_STATUSES = ["pending", "successful", "failed", "reversed", "unknown"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const REVIEW_STATES = ["needs_review", "confirmed", "ignored"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/**
 * Tested unambiguous merchant mappings. Matched on whole normalized words only;
 * marketplaces (Amazon, Flipkart) are deliberately absent because they sell many kinds of items.
 */
const MERCHANT_RULES: Array<{ pattern: RegExp; category: CategoryId }> = [
  { pattern: /\b(swiggy|zomato|starbucks|domino'?s|mcdonald'?s|kfc|chaayos|cafe coffee day|ccd)\b/, category: "food_drinks" },
  { pattern: /\b(bigbasket|blinkit|zepto|dmart|jiomart|more supermarket|swiggy instamart)\b/, category: "groceries" },
  { pattern: /\b(uber|ola|rapido|irctc|indian oil|iocl|hpcl|bharat petroleum|bpcl|namma metro|delhi metro|redbus)\b/, category: "transport" },
  { pattern: /\b(bescom|tata power|adani electricity|airtel|jio prepaid|bsnl|act fibernet|msedcl)\b/, category: "housing_bills" },
  { pattern: /\b(pharmeasy|1mg|apollo pharmacy|netmeds|medplus)\b/, category: "health" },
  { pattern: /\b(bookmyshow|netflix|spotify|hotstar|pvr|inox)\b/, category: "entertainment" },
  { pattern: /\b(myntra|ajio|croma|reliance digital|decathlon)\b/, category: "shopping" },
];

export function normalizeMerchant(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function deterministicCategory(counterparty: string | null | undefined): CategoryId | null {
  if (!counterparty) return null;
  const n = normalizeMerchant(counterparty);
  for (const r of MERCHANT_RULES) if (r.pattern.test(n)) return r.category;
  return null;
}
