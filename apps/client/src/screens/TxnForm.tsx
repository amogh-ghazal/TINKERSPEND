import { useState } from "react";
import { CATEGORIES, KINDS, PAYMENT_STATUSES, parseRupeesToPaise, type CategoryId, type Kind, type PaymentStatus } from "@tinkerspend/domain";
import { api, ApiFailure, newOperationId } from "../lib/api";
import { KIND_LABEL, STATUS_LABEL, today } from "../lib/format";
import type { Txn } from "../lib/types";

export function TxnForm({ existing, onDone, onCancel }: { existing?: Txn; onDone: (t: Txn) => void; onCancel?: () => void }) {
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "expense");
  const [status, setStatus] = useState<PaymentStatus>(existing?.payment_status ?? "successful");
  const [date, setDate] = useState(existing?.effective_local_date ?? today());
  const [counterparty, setCounterparty] = useState(existing?.counterparty ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState<CategoryId>(existing?.allocations[0]?.category_id ?? "uncategorized");
  const [rule, setRule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [opId] = useState(newOperationId);
  const split = (existing?.allocations.length ?? 0) > 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const parsed = parseRupeesToPaise(amount);
    if (!parsed.ok) { setErr("Enter a positive amount in rupees, e.g. 249.50"); return; }
    setBusy(true);
    try {
      const common = { amount, kind, payment_status: status, effective_local_date: date, counterparty: counterparty || null, description: description || null };
      const cat = kind === "expense" && !split ? { category_id: category } : {};
      const r = existing
        ? await api<{ transaction: Txn }>("PATCH", `/transactions/${existing.id}`, { version: existing.version, review_state: "confirmed", ...common, ...cat, ...(rule && counterparty ? { apply_rule: { scope: "counterparty_exact" } } : {}) })
        : await api<{ transaction: Txn }>("POST", "/transactions", { operation_id: opId, ...common, ...cat });
      onDone(r.transaction);
    } catch (e) {
      setErr(e instanceof ApiFailure && e.code === "version_conflict" ? "This item changed elsewhere. Reload and try again." : (e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <form className="form" onSubmit={submit} aria-label={existing ? "Edit transaction" : "Add transaction"}>
      <label>Amount (₹)<input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
      <label>Type<select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>{KINDS.filter((k) => k !== "refund" || existing?.kind === "refund").map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
      <label>Payment status<select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus)}>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
      <label>Date<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Merchant / person<input maxLength={120} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></label>
      <label>Note<input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      {kind === "expense" && !split && <label>Category<select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      {split && <p className="muted">Split across {existing!.allocations.length} categories; edit the split from the receipt draft.</p>}
      {existing && counterparty && kind === "expense" && <label className="check"><input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} /> Always use this category for “{counterparty}”</label>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row"><button type="submit" disabled={busy}>{busy ? "Saving…" : existing ? "Save changes" : "Add"}</button>{onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}</div>
    </form>
  );
}
