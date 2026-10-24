import { useCallback, useEffect, useState } from "react";
import { CATEGORIES, parseRupeesToPaise, type CategoryId, type Kind } from "@tinkerspend/domain";
import { loadReceipt } from "../lib/receipts";
import { api, newOperationId } from "../lib/api";
import { categoryName, inr, KIND_LABEL, STATUS_LABEL, today } from "../lib/format";
import type { Txn } from "../lib/types";
import { TxnForm } from "./TxnForm";

export function Ledger({ month, reviewOnly, onChanged, timezone = "Asia/Kolkata" }: { month: string; reviewOnly: boolean; onChanged: () => void; timezone?: string }) {
  const [items, setItems] = useState<Txn[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const load = useCallback(() => { setErr(null); api<{ items: Txn[] }>("GET", `/transactions?month=${month}&limit=100`).then((r) => setItems(r.items), (e) => setErr(e.message)); }, [month]);
  useEffect(load, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && !editing && !refunding && !purpose) load(); };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [load, editing, refunding, purpose]);
  const changed = () => { setEditing(null); setRefunding(null); setPurpose(null); load(); onChanged(); };
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
                {t.source === "notification" && <div className="muted" data-testid="notification-details">
                  {t.notification_posted_at ? `Alert time: ${new Date(t.notification_posted_at).toLocaleString("en-IN", { timeZone: timezone })} (${timezone})` : "Alert time unavailable"}
                  {` · ${t.reported_bank ? `Bank reported: ${t.reported_bank}` : "Bank unavailable or unclear"}`}
                </div>}
                {t.capture_warnings?.includes("possible_duplicate") && <p className="warn">Possible duplicate alert. Ignore it if the payment is already recorded; confirm only if this was a separate payment.</p>}
                {t.description && <p>{t.description}</p>}
                {t.receipt_draft_id && <ReceiptBadge draftId={t.receipt_draft_id} />}
                {t.suggestion && (
                  <p className="suggestion" data-testid="suggestion">
                    Suggested: <strong>{categoryName(t.suggestion.category_id)}</strong> ({KIND_LABEL[t.suggestion.kind]}){t.suggestion.reason ? ` — ${t.suggestion.reason}` : ""}
                    <span className="muted"> · {t.suggestion.model === "rule" ? "your rule" : t.suggestion.model === "merchant_map" ? "known merchant" : "AI suggestion, not confirmed"}</span>
                  </p>
                )}
                {t.review_state !== "confirmed" && <span className={`badge ${t.review_state}`}>{t.review_state === "needs_review" ? "Needs review" : "Ignored"}</span>}
              </div>
              <strong className={t.direction === "incoming" || t.kind === "refund" ? "pos" : ""}>{t.kind === "refund" ? "−" : ""}{inr(t.amount_paise)}</strong>
            </div>
            <div className="row">
              {t.source === "notification" && t.direction === "outgoing" && t.payment_status === "successful" && t.review_state !== "ignored" && (!t.description || t.review_state === "needs_review" || t.allocations.some((a) => a.category_id === "uncategorized")) && <button className="secondary" onClick={() => setPurpose(purpose === t.id ? null : t.id)}>What was this payment for?</button>}
              {t.receipt_draft_id && t.source !== "receipt" && <button className="secondary" disabled={busy === t.id} onClick={async () => {
                setBusy(t.id); setErr(null);
                try { await api("POST", `/drafts/${t.receipt_draft_id}/detach`); changed(); }
                catch (e) { setErr((e as Error).message); }
                finally { setBusy(null); }
              }}>Undo receipt attachment</button>}
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
            {purpose === t.id && <PurposeForm transaction={t} onDone={changed} />}
            {refunding === t.id && <RefundForm original={t} onDone={changed} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PurposeForm({ transaction: t, onDone }: { transaction: Txn; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>(t.kind === "unknown" ? "expense" : t.kind);
  const [category, setCategory] = useState<CategoryId>(t.allocations[0]?.category_id ?? "uncategorized");
  const [note, setNote] = useState(t.description ?? "");
  const [remember, setRemember] = useState(false);
  const [separate, setSeparate] = useState(false);
  const possibleDuplicate = t.capture_warnings?.includes("possible_duplicate") ?? false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <form className="form" aria-label="Explain payment" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await api("PATCH", `/transactions/${t.id}`, {
        version: t.version, kind, review_state: kind === "unknown" ? "needs_review" : "confirmed", description: note || null,
        ...(kind === "expense" ? { category_id: category } : {}),
        ...(remember && kind === "expense" && t.counterparty ? { apply_rule: { scope: "counterparty_exact" } } : {}),
      });
      onDone();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }}>
    <p>{inr(t.amount_paise)} · {t.counterparty ?? "Payee not present in alert"}. You can answer later; capture continues.</p>
    <label>This payment was<select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
      <option value="expense">Spending</option><option value="transfer">A transfer, not spending</option><option value="unknown">Not sure yet</option>
    </select></label>
    {kind === "expense" && <label>Purpose category<select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    <label>What was it for?<input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. dinner with friends" /></label>
    {possibleDuplicate && kind === "expense" && <label className="check"><input type="checkbox" required checked={separate} onChange={(e) => setSeparate(e.target.checked)} /> This was a separate payment, not another alert for an existing payment.</label>}
    {kind === "expense" && t.counterparty && <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember this category for {t.counterparty}</label>}
    {error && <p role="alert" className="error">{error}</p>}
    <button type="submit" disabled={busy || (possibleDuplicate && kind === "expense" && !separate)}>{busy ? "Saving…" : "Save purpose"}</button>
  </form>;
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
