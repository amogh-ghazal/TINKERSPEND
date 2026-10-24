import { useCallback, useEffect, useState } from "react";
import { parseRupeesToPaise } from "@tinkerspend/domain";
import { loadReceipt } from "../lib/receipts";
import { api, newOperationId } from "../lib/api";
import { categoryName, inr, KIND_LABEL, STATUS_LABEL, today } from "../lib/format";
import type { Txn } from "../lib/types";
import { TxnForm } from "./TxnForm";

export function Ledger({ month, reviewOnly, onChanged }: { month: string; reviewOnly: boolean; onChanged: () => void }) {
  const [items, setItems] = useState<Txn[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { setErr(null); api<{ items: Txn[] }>("GET", `/transactions?month=${month}&limit=100`).then((r) => setItems(r.items), (e) => setErr(e.message)); }, [month]);
  useEffect(load, [load]);
  const changed = () => { setEditing(null); setRefunding(null); load(); onChanged(); };
  const shown = (items ?? []).filter((t) => !reviewOnly || t.review_state === "needs_review");

  async function del(t: Txn) {
    if (!confirm(`Delete ${inr(t.amount_paise)} ${t.counterparty ?? ""}?`)) return;
    try { await api("DELETE", `/transactions/${t.id}?version=${t.version}`); changed(); } catch (e) { setErr((e as Error).message); }
  }
  async function suggest(t: Txn) {
    setBusy(t.id); setErr(null);
    try {
      const r = await api<{ status: string; reason?: string }>("POST", "/ai/classify", { draft_id: t.id, operation_id: newOperationId() });
      if (r.status === "needs_review") setErr("No confident suggestion; please categorize it yourself.");
      if (r.status === "skipped" && r.reason === "ai_disabled") setErr("AI suggestions are turned off in settings.");
      load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function accept(t: Txn) {
    const s = t.suggestion!;
    try { await api("PATCH", `/transactions/${t.id}`, { version: t.version, kind: s.kind === "unknown" ? undefined : s.kind, category_id: s.category_id, review_state: "confirmed" }); changed(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function confirmTxn(t: Txn, review_state: "confirmed" | "ignored") {
    try { await api("PATCH", `/transactions/${t.id}`, { version: t.version, review_state }); changed(); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <section className="card" aria-labelledby="led-h">
      <h2 id="led-h">{reviewOnly ? "Needs review" : "Transactions"}</h2>
      {err && <p className="error" role="alert">{err}</p>}
      {!items && !err && <p>Loading…</p>}
      {items && shown.length === 0 && <p>{reviewOnly ? "Nothing to review." : "No transactions this month."}</p>}
      <ul className="plain txns">
        {shown.map((t) => (
          <li key={t.id} data-testid="txn">
            <div className="row between">
              <div>
                <strong>{t.counterparty || t.description || KIND_LABEL[t.kind]}</strong>
                <div className="muted">{t.effective_local_date} · {KIND_LABEL[t.kind]} · {STATUS_LABEL[t.payment_status]}{t.kind === "expense" && t.allocations.length ? ` · ${t.allocations.map((a) => categoryName(a.category_id)).join(", ")}` : ""} · {t.source}</div>
                {t.receipt_draft_id && <ReceiptBadge draftId={t.receipt_draft_id} />}
                {t.suggestion && (
                  <p className="suggestion" data-testid="suggestion">
                    Suggested: <strong>{categoryName(t.suggestion.category_id)}</strong> ({KIND_LABEL[t.suggestion.kind]}){t.suggestion.reason ? ` — ${t.suggestion.reason}` : ""}
                    <span className="muted"> · {t.suggestion.model === "rule" ? "your rule" : t.suggestion.model === "merchant_map" ? "known merchant" : "AI suggestion, not confirmed"}</span>
                  </p>
                )}
                {t.review_state !== "confirmed" && <span className={`badge ${t.review_state}`}>{t.review_state === "needs_review" ? "Needs review" : "Ignored"}</span>}
              </div>
              <strong className={t.direction === "in" || t.kind === "refund" ? "pos" : ""}>{t.kind === "refund" ? "−" : ""}{inr(t.amount_paise)}</strong>
            </div>
            <div className="row">
              {t.review_state === "needs_review" && t.kind !== "unknown" && <button onClick={() => confirmTxn(t, "confirmed")}>Confirm</button>}
              {t.review_state === "needs_review" && t.suggestion && t.suggestion.kind !== "unknown" && <button onClick={() => accept(t)}>Accept suggestion</button>}
              {t.review_state === "needs_review" && !t.suggestion && (t.kind === "unknown" || t.kind === "expense") && t.direction !== "incoming" && (
                <button className="secondary" disabled={busy === t.id} title="Sends only the payee name, amount and payment status to OpenAI" onClick={() => suggest(t)}>{busy === t.id ? "Asking…" : "Suggest category"}</button>
              )}
              {t.review_state === "needs_review" && <button className="secondary" onClick={() => confirmTxn(t, "ignored")}>Ignore</button>}
              <button className="secondary" onClick={() => setEditing(editing === t.id ? null : t.id)}>Edit</button>
              {t.kind === "expense" && t.payment_status === "successful" && <button className="secondary" onClick={() => setRefunding(refunding === t.id ? null : t.id)}>Refund</button>}
              <button className="secondary danger" onClick={() => del(t)}>Delete</button>
            </div>
            {editing === t.id && <TxnForm existing={t} onDone={changed} onCancel={() => setEditing(null)} />}
            {refunding === t.id && <RefundForm original={t} onDone={changed} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RefundForm({ original, onDone }: { original: Txn; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [err, setErr] = useState<string | null>(null);
  const [opId] = useState(newOperationId);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parseRupeesToPaise(amount).ok) { setErr("Enter a valid amount"); return; }
    try { await api("POST", `/transactions/${original.id}/refund`, { operation_id: opId, original_transaction_id: original.id, amount, effective_local_date: date }); onDone(); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Record refund">
      <label>Refund amount (₹)<input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Refund received on<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <button type="submit">Save refund</button>
    </form>
  );
}

function ReceiptBadge({ draftId }: { draftId: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let u: string | null = null;
    loadReceipt(draftId).then((b) => { u = b ? URL.createObjectURL(b) : null; setUrl(u); }).catch(() => setUrl(null));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [draftId]);
  if (url === undefined) return null;
  return <p className="muted" data-testid="receipt-badge">{url ? <>Receipt saved on this device · <a href={url} target="_blank" rel="noreferrer">View</a></> : "Receipt attached · original photo is on another device"}</p>;
}
