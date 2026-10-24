export interface MatchCandidate {
  id: string;
  amountPaise: number;
  effectiveLocalDate: string;
  counterparty: string | null;
  kind: string;
  references: Array<{ namespace: string; value: string }>;
}

export interface MatchProbe {
  amountPaise: number;
  effectiveLocalDate: string;
  counterparty: string | null;
  kind: string;
  reference: { namespace: string; value: string } | null;
}

function dayDiff(a: string, b: string): number {
  return Math.abs((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);
}

function norm(s: string | null) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Strong match: same reference namespace+value AND same amount AND same kind. */
export function strongMatch(probe: MatchProbe, candidates: MatchCandidate[]): MatchCandidate | null {
  if (!probe.reference) return null;
  for (const c of candidates) {
    if (c.amountPaise !== probe.amountPaise || c.kind !== probe.kind) continue;
    if (c.references.some((r) => r.namespace === probe.reference!.namespace && r.value === probe.reference!.value)) return c;
  }
  return null;
}

/** Suggestions only — never auto-merged. Exact amount, ≤2 days apart, optional merchant similarity. */
export function suggestMatches(probe: MatchProbe, candidates: MatchCandidate[], maxDays = 2): Array<{ candidate: MatchCandidate; score: number }> {
  const out: Array<{ candidate: MatchCandidate; score: number }> = [];
  for (const c of candidates) {
    if (c.amountPaise !== probe.amountPaise) continue;
    const dd = dayDiff(c.effectiveLocalDate, probe.effectiveLocalDate);
    if (dd > maxDays) continue;
    let score = 3 - dd;
    const a = norm(probe.counterparty), b = norm(c.counterparty);
    if (a && b && (a.includes(b) || b.includes(a))) score += 2;
    out.push({ candidate: c, score });
  }
  return out.sort((x, y) => y.score - x.score);
}
