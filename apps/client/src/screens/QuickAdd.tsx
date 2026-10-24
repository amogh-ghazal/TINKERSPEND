import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type CategoryId } from "@tinkerspend/domain";
import { api, ApiFailure, newOperationId } from "../lib/api";
import { KIND_LABEL } from "../lib/format";
import type { Draft, DraftEntry, Txn } from "../lib/types";
import { isNative, Recorder } from "../native";
import { loadReceipt, normalizeReceipt, saveReceipt } from "../lib/receipts";

const MAX_MS = 60_000;
const MAX_BYTES = 3 * 1024 * 1024;
const NOTE: Record<string, string> = {
  amount_missing: "Amount not found — enter it.", amount_unclear: "Amount unclear — check it.", amount_not_in_source: "The suggested amount wasn't in what you said — enter it.",
  multiple_amounts: "Several numbers in one item — enter the right amount.", date_assumed_reference_day: "No date mentioned — assumed the day you recorded/typed it.",
  date_unclear: "Date unclear — pick it.", non_inr_currency: "Not in rupees — enter the INR amount.", nothing_extracted: "Nothing recognised — fill it in or discard.",
  receipt_unreadable: "Couldn't read this receipt — enter the details from the photo.", receipt_mismatch: "Items, taxes and discounts don't add up to the total — correct them or save the total only.",
  line_amount_missing: "An item has no amount.", too_many_lines: "Long receipt: some items may be missing — check before splitting.", duplicate_image: "You've already saved this same photo.",
};
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
const errText = (e: unknown) => e instanceof ApiFailure && e.code === "quota_exceeded" ? "Daily AI limit reached. Your input is kept — type the expense instead or try tomorrow." : (e as Error).message;

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}
function base64ToBlob(b64: string, type: string) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); }
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

type Rec = { state: "idle" } | { state: "recording"; startedAt: number } | { state: "recorded"; startedAt: number; blob: Blob; durationMs: number; url: string } | { state: "uploading"; startedAt: number; blob: Blob; durationMs: number; url: string };
type ChatTurn = { id: number; from: "person" | "assistant"; text: string };

export function QuickAdd({ onSaved }: { onSaved: (t: Txn) => void }) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rec, setRec] = useState<Rec>({ state: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const mr = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  const timer = useRef<number | null>(null);
  const voiceOp = useRef<string>(newOperationId());
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; takenAt: number; op: string; busy: boolean } | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([{ id: 0, from: "assistant", text: "Hi! Tell me what you spent on, send a receipt, or record a voice note. I’ll prepare an editable draft for you to review." }]);
  const nextTurnId = useRef(1);
  const addTurn = (from: ChatTurn["from"], message: string) => setTurns((items) => [...items, { id: nextTurnId.current++, from, text: message }]);

  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      const blob = await normalizeReceipt(f);
      const t = Date.now();
      const takenAt = f.lastModified && f.lastModified <= t && f.lastModified > t - 29 * 86_400_000 ? f.lastModified : t;
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob), takenAt, op: newOperationId(), busy: false });
    } catch (e) { setErr((e as Error).message); }
  }

  async function readReceipt() {
    if (!photo) return;
    setPhoto({ ...photo, busy: true }); setErr(null);
    try {
      const r = await api<{ drafts: Draft[] }>("POST", "/drafts/receipt", { operation_id: photo.op, reference_time: photo.takenAt, timezone: tz(), mime_type: "image/jpeg", data_base64: await blobToBase64(photo.blob) });
      for (const d of r.drafts) await saveReceipt(d.id, photo.blob).catch(() => undefined);
      addTurn("person", "Sent a receipt photo");
      addTurn("assistant", `I read the receipt and prepared ${r.drafts.length} editable draft${r.drafts.length === 1 ? "" : "s"}. Check the details below before saving.`);
      URL.revokeObjectURL(photo.url); setPhoto(null); await load();
    } catch (e) {
      setPhoto({ ...photo, busy: false, op: newOperationId() });
      setErr(e instanceof ApiFailure && e.code === "outcome_unknown" ? "Receipt reading didn't answer in time and won't be retried automatically. Try again or enter it manually." : errText(e));
    }
  }

  const load = () => api<{ items: Draft[] }>("GET", "/drafts").then((r) => setDrafts(r.items)).catch((e) => setErr(errText(e)));
  useEffect(() => { load(); return () => { if (timer.current) clearInterval(timer.current); }; }, []);

  async function extractText(t: string, referenceTime: number) {
    setBusy(true); setErr(null); setInfo(null);
    try {
      const r = await api<{ drafts: Draft[]; method: string; note: string | null }>("POST", "/drafts/text", { operation_id: newOperationId(), text: t, reference_time: referenceTime, timezone: tz() });
      addTurn("person", t);
      addTurn("assistant", r.drafts.length ? `I prepared ${r.drafts.length} editable draft${r.drafts.length === 1 ? "" : "s"}. Check the details below, then save only what’s correct.` : "I couldn’t find a clear expense in that message. Try adding the amount or a little more detail.");
      if (r.method === "deterministic" && r.note) setInfo("Parsed on the server without AI; please check each draft.");
      setText(""); await load();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  async function startRec() {
    setErr(null);
    const startedAt = Date.now();
    try {
      if (isNative) await Recorder.start();
      else {
        const mime = pickMime();
        if (mime === null || !navigator.mediaDevices?.getUserMedia) { setErr("Recording isn't supported in this browser. Type the expense instead."); return; }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks: Blob[] = [];
        r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        r.start(); mr.current = { rec: r, chunks, stream };
      }
      voiceOp.current = newOperationId();
      setRec({ state: "recording", startedAt }); setElapsed(0);
      timer.current = window.setInterval(() => { const ms = Date.now() - startedAt; setElapsed(ms); if (ms >= MAX_MS) void stopRec(startedAt); }, 250);
    } catch (e) {
      const denied = (e as { code?: string; name?: string }).code === "permission_denied" || (e as { name?: string }).name === "NotAllowedError";
      setErr(denied ? "Microphone permission was denied. You can allow it in settings, or type the expense." : "Could not start recording.");
    }
  }

  async function stopRec(startedAt: number) {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    try {
      let blob: Blob, durationMs: number;
      if (isNative) { const r = await Recorder.stop(); blob = base64ToBlob(r.base64, r.mimeType); durationMs = r.durationMs; }
      else {
        const m = mr.current!; mr.current = null;
        blob = await new Promise<Blob>((res) => { m.rec.onstop = () => res(new Blob(m.chunks, { type: m.rec.mimeType || "audio/webm" })); m.rec.stop(); });
        m.stream.getTracks().forEach((t) => t.stop());
        durationMs = Math.min(Date.now() - startedAt, MAX_MS);
      }
      if (blob.size > MAX_BYTES) { setRec({ state: "idle" }); setErr("Recording is larger than 3 MiB. Please record a shorter note."); return; }
      setRec({ state: "recorded", startedAt, blob, durationMs, url: URL.createObjectURL(blob) });
    } catch (e) { setRec({ state: "idle" }); setErr((e as { code?: string }).code === "too_short" ? "Recording too short." : "Recording failed."); }
  }

  async function cancelRec() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (isNative) await Recorder.cancel().catch(() => undefined);
    else if (mr.current) { mr.current.rec.stop(); mr.current.stream.getTracks().forEach((t) => t.stop()); mr.current = null; }
    if (rec.state === "recorded") URL.revokeObjectURL(rec.url);
    setRec({ state: "idle" });
  }

  async function upload() {
    if (rec.state !== "recorded") return;
    const recording = rec;
    setRec({ ...recording, state: "uploading" }); setErr(null);
    try {
      await api("POST", "/drafts/voice", { operation_id: voiceOp.current, reference_time: recording.startedAt, timezone: tz(), mime_type: recording.blob.type || "audio/webm", data_base64: await blobToBase64(recording.blob), duration_ms: Math.max(1, recording.durationMs) });
      addTurn("person", `Sent a voice note · ${(recording.durationMs / 1000).toFixed(1)} seconds`);
      addTurn("assistant", "I transcribed the voice note and prepared a draft. Check the transcript and expense details below before saving.");
      URL.revokeObjectURL(recording.url); setRec({ state: "idle" }); await load();
    } catch (e) {
      // Keep the recording so nothing is lost; a new attempt uses a new operation only when the user asks.
      setRec({ ...recording, state: "recorded" }); voiceOp.current = newOperationId();
      setErr(e instanceof ApiFailure && e.code === "outcome_unknown" ? "Transcription didn't answer in time and won't be retried automatically. Try again or type it." : errText(e));
    }
  }

  return (
    <section className="card assistant-workspace" aria-label="TinkerSpend expense assistant">
      <div className="assistant-heading">
        <div><p className="eyebrow">YOUR EXPENSE ASSISTANT</p><h2>Just tell me what happened</h2><p className="muted">Send a message, voice note, or receipt. I’ll turn it into a draft for you to review.</p></div>
        <span className="demo-badge live-badge"><span />Connected to your ledger</span>
      </div>

      <div className="chat-frame">
        <div className="chat-topbar">
          <div className="chat-avatar" aria-hidden="true">T</div>
          <div className="chat-contact"><strong>TinkerSpend</strong><span><i /> Personal expense assistant</span></div>
          <span className="chat-lock" aria-label="Private account">●</span>
        </div>
        <div className="chat-wall">
          <div className="chat-day">THIS CONVERSATION</div>
          <div className="chat-thread" aria-live="polite">
            {turns.map((turn) => <div className={`chat-message ${turn.from}`} key={turn.id}><p>{turn.text}</p><small className="chat-time">{turn.from === "person" ? "You · " : "TinkerSpend · "}now</small></div>)}
          </div>
          {drafts.length === 0 && turns.length === 1 && <div className="chat-suggestions" aria-label="Try a message">
            <span>TRY A MESSAGE</span>
            <button type="button" className="chat-chip" onClick={() => setText("Yesterday I spent ₹540 on groceries at Reliance Fresh")}>Groceries yesterday</button>
            <button type="button" className="chat-chip" onClick={() => setText("Paid ₹180 for coffee and snacks")}>Coffee and snacks</button>
          </div>}
          {photo && <div className="chat-attachment" aria-label="Receipt photo preview"><img src={photo.url} alt="Receipt to read" className="receipt-thumb" /><div><strong>Receipt photo ready</strong><span>Review its details before saving.</span></div><button type="button" disabled={photo.busy} onClick={readReceipt}>{photo.busy ? "Reading…" : "Read receipt"}</button><button type="button" className="secondary" disabled={photo.busy} onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); }}>Remove</button></div>}
          {rec.state === "recording" && <div className="chat-recording" role="status"><span className="recording-dot" /> Recording · {Math.floor(elapsed / 1000)}s / 60s <button type="button" onClick={() => void stopRec(rec.startedAt)}>Stop</button><button type="button" className="secondary" onClick={() => void cancelRec()}>Cancel</button></div>}
          {(rec.state === "recorded" || rec.state === "uploading") && <div className="chat-recording" aria-label="Voice note preview"><audio controls src={rec.url} /><span className="muted">{(rec.durationMs / 1000).toFixed(1)}s</span><button type="button" disabled={rec.state === "uploading"} onClick={upload}>{rec.state === "uploading" ? "Transcribing…" : "Send voice note"}</button><button type="button" className="secondary" disabled={rec.state === "uploading"} onClick={() => void cancelRec()}>Remove</button></div>}
        </div>
        <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !busy) void extractText(text.trim(), Date.now()); }}>
          <label className="sr-only" htmlFor="expense-message">Describe an expense</label>
          <textarea id="expense-message" rows={1} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message TinkerSpend… e.g. ₹450 dinner with friends" />
          <div className="chat-tools">
            {rec.state === "idle" && <button type="button" className="chat-tool record-tool" aria-label="Record a voice note" title="Record a voice note" onClick={() => void startRec()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button>}
            <label className="chat-tool chat-upload" aria-label="Attach a receipt photo" title="Attach a receipt photo"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path d="m5 18 5-5 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg><input hidden type="file" accept="image/jpeg,image/png" capture="environment" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button type="submit" className="chat-send" aria-label="Send message" disabled={busy || !text.trim()}>{busy ? "…" : "↑"}</button>
          </div>
        </form>
      </div>
      {err && <p role="alert" className="error assistant-error">{err}</p>}
      {info && <p className="muted assistant-info" role="status">{info}</p>}
      <p className="assistant-disclaimer">OpenAI extraction runs only when enabled for your account and the private API key is configured on the server. Otherwise TinkerSpend uses its built-in parser. Nothing reaches your ledger until you review and save a draft.</p>
      {drafts.length > 0 && <div className="assistant-drafts"><h3>Your drafts <span>Review before saving</span></h3>{drafts.map((d) => <DraftCard key={`${d.id}-${d.version}`} d={d} onChanged={load} onSaved={(t) => { onSaved(t); void load(); }} onReextract={(t) => extractText(t, d.reference_at).then(() => api("POST", `/drafts/${d.id}/discard`)).then(load)} />)}</div>}
    </section>
  );
}

function DraftCard({ d, onChanged, onSaved, onReextract }: { d: Draft; onChanged: () => void; onSaved: (t: Txn) => void; onReextract: (t: string) => void }) {
  const [e, setE] = useState<DraftEntry>(d.entry);
  const [paid, setPaid] = useState(false);
  const [transcript, setTranscript] = useState(d.transcript ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [opId] = useState(newOperationId);
  const [img, setImg] = useState<string | null | undefined>(undefined);
  const [matches, setMatches] = useState<{ score: number; transaction: Txn }[]>([]);
  useEffect(() => {
    if (d.source !== "receipt") return;
    let url: string | null = null;
    loadReceipt(d.id).then((b) => { url = b ? URL.createObjectURL(b) : null; setImg(url); }).catch(() => setImg(null));
    api<{ items: { score: number; transaction: Txn }[] }>("GET", `/drafts/${d.id}/matches`).then((r) => setMatches(r.items)).catch(() => undefined);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [d.id, d.source, d.version]);
  const setLine = (i: number, k: "description" | "amount" | "category_id", v: string | null) => set("line_items", e.line_items.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const set = <K extends keyof DraftEntry>(k: K, v: DraftEntry[K]) => setE({ ...e, [k]: v });
  const dirty = (Object.keys(e) as (keyof DraftEntry)[]).filter((k) => JSON.stringify(e[k]) !== JSON.stringify(d.entry[k]));

  async function save(extra: { attach_to_transaction_id?: string; ignore_line_items?: boolean } = {}) {
    setBusy(true); setErr(null);
    try {
      let version = d.version;
      if (dirty.length) {
        const patch = Object.fromEntries(dirty.map((k) => [k, e[k]]));
        version = (await api<{ draft: Draft }>("PATCH", `/drafts/${d.id}`, { version, entry: patch })).draft.version;
      }
      const r = await api<{ transaction: Txn }>("POST", `/drafts/${d.id}/commit`, { operation_id: extra.attach_to_transaction_id ? newOperationId() : opId, version, paid_confirmed: paid || !!extra.attach_to_transaction_id, ...extra });
      onSaved(r.transaction);
    } catch (x) {
      const f = x instanceof ApiFailure ? (x.details as Record<string, string> | undefined) : undefined;
      setErr(f?.receipt ? NOTE[f.receipt === "mismatch" ? "receipt_mismatch" : "line_amount_missing"]! : f?.attach ? "The amounts differ — fix the draft or save it separately." : f?.paid_confirmed ? "Tick “I paid this” to save it as spending." : f?.amount ? "Enter the amount." : f?.effective_local_date ? "Pick the date." : (x as Error).message);
      onChanged();
    } finally { setBusy(false); }
  }

  return (
    <article className="txn draft" data-testid="draft" aria-label={`Draft ${e.description ?? ""}`}>
      {d.source === "receipt" && (img ? <img src={img} alt="Receipt" className="receipt-view" /> : img === null ? <p className="muted">Original photo isn't on this device (it stays on the device that took it).</p> : null)}
      <div className="draft-main">
        <label className="big">Amount (₹)<input inputMode="decimal" value={e.amount ?? ""} onChange={(x) => set("amount", x.target.value || null)} /></label>
        <label className="big">Date<input type="date" value={e.effective_local_date ?? ""} onChange={(x) => set("effective_local_date", x.target.value || null)} /></label>
      </div>
      <label>What<input value={e.description ?? ""} maxLength={500} onChange={(x) => set("description", x.target.value || null)} /></label>
      <div className="row">
        <label>Type<select value={e.kind} onChange={(x) => set("kind", x.target.value as DraftEntry["kind"])}>{(["expense", "income", "transfer", "unknown"] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        {e.kind === "expense" && <label>Category<select aria-label="Draft category" value={e.category_id ?? "uncategorized"} onChange={(x) => set("category_id", x.target.value as CategoryId)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      </div>
      {d.source === "receipt" && e.line_items.length > 0 && (
        <fieldset className="lines"><legend>Items</legend>
          {e.line_items.map((l, i) => (
            <div className="row" key={i} data-testid="line">
              <input aria-label={`Item ${i + 1}`} value={l.description} onChange={(x) => setLine(i, "description", x.target.value)} />
              <input aria-label={`Item ${i + 1} amount`} inputMode="decimal" value={l.amount ?? ""} onChange={(x) => setLine(i, "amount", x.target.value || null)} />
              <select aria-label={`Item ${i + 1} category`} value={l.category_id ?? "uncategorized"} onChange={(x) => setLine(i, "category_id", x.target.value)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
          ))}
          {d.receipt && [["Tax", d.receipt.taxes], ["Fees", d.receipt.fees], ["Discounts", d.receipt.discounts]].filter(([, v]) => (v as string[]).length).map(([k, v]) => <p key={k as string} className="muted">{k as string}: ₹{(v as string[]).join(", ₹")}</p>)}
        </fieldset>
      )}
      {d.assumptions.filter((a) => NOTE[a]).map((a) => <p key={a} className="warn">{NOTE[a]}</p>)}
      <p className="muted">{d.source === "voice" ? "From voice" : d.source === "receipt" ? "From receipt" : "From text"} · {d.extraction === "ai" ? "AI-extracted" : "parsed without AI"}{d.input_text ? ` · “${d.input_text}”` : ""}</p>
      {d.transcript !== null && (
        <details><summary>Transcript</summary>
          <textarea rows={2} value={transcript} onChange={(x) => setTranscript(x.target.value)} aria-label="Transcript" />
          <button className="secondary" disabled={!transcript.trim() || transcript === d.transcript} onClick={() => onReextract(transcript.trim())}>Re-read edited transcript</button>
        </details>
      )}
      {e.kind === "expense" && <label className="check"><input type="checkbox" checked={paid} onChange={(x) => setPaid(x.target.checked)} /> I paid this</label>}
      {matches.length > 0 && (
        <div aria-label="Possible matches"><p><strong>Already recorded?</strong> Attach this receipt instead of adding it again:</p>
          {matches.map((m) => <div className="row" key={m.transaction.id}><span>₹{m.transaction.amount} · {m.transaction.effective_local_date} · {m.transaction.counterparty ?? "—"}</span><button className="secondary" disabled={busy} onClick={() => save({ attach_to_transaction_id: m.transaction.id })}>Attach to this</button></div>)}
        </div>
      )}
      {err && <p role="alert" className="error">{err}</p>}
      <div className="row">
        <button disabled={busy} onClick={() => save()}>Save</button>
        {d.source === "receipt" && d.assumptions.includes("receipt_mismatch") && <button className="secondary" disabled={busy} onClick={() => save({ ignore_line_items: true })}>Save total only</button>}
        <button className="secondary" disabled={busy} onClick={() => api("POST", `/drafts/${d.id}/discard`).then(onChanged)}>Discard</button>
      </div>
    </article>
  );
}
