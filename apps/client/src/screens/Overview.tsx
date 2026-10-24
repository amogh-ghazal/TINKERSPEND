import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { categoryName, inr, shiftMonth } from "../lib/format";
import type { Summary } from "../lib/types";

export function Overview({ month, setMonth, onOpenReview }: { month: string; setMonth: (m: string) => void; onOpenReview: () => void }) {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setS(null); setErr(null); api<Summary>("GET", `/summary?month=${month}`).then(setS, (e) => setErr(e.message)); }, [month]);
  return (
    <section className="card" aria-labelledby="ov-h">
      <div className="row between">
        <button className="secondary" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <h2 id="ov-h">{new Date(`${month}-01T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" })}</h2>
        <button className="secondary" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {!s && !err && <p>Loading…</p>}
      {s && (
        <>
          <div className="stats">
            <div><span>Net spending</span><strong data-testid="net">{inr(s.netSpendingPaise)}</strong></div>
            <div><span>Gross</span><strong data-testid="gross">{inr(s.grossSpendingPaise)}</strong></div>
            <div><span>Refunds</span><strong data-testid="refunds">{inr(s.refundsPaise)}</strong></div>
          </div>
          {(s.needsReview.count > 0 || s.pending.count > 0) && (
            <div className="notice">
              {s.needsReview.count > 0 && <p>Needs review: <strong data-testid="review">{inr(s.needsReview.amountPaise)}</strong> in {s.needsReview.count} item(s), not included in totals. <button className="link" onClick={onOpenReview}>Review</button></p>}
              {s.pending.count > 0 && <p>Pending payments: <strong data-testid="pending">{inr(s.pending.amountPaise)}</strong> in {s.pending.count} item(s), not included until successful.</p>}
            </div>
          )}
          <h3>By category</h3>
          {s.byCategory.length === 0 ? <p>No confirmed spending this month.</p> : (
            <table className="table"><thead><tr><th>Category</th><th>Spent</th><th>Refunded</th><th>Net</th></tr></thead>
              <tbody>{s.byCategory.map((c) => <tr key={c.categoryId}><td>{categoryName(c.categoryId)}</td><td>{inr(c.spentPaise)}</td><td>{c.refundedPaise ? inr(c.refundedPaise) : "—"}</td><td>{inr(c.netPaise)}</td></tr>)}</tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
