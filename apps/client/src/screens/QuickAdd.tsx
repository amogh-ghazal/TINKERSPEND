import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type CategoryId } from "@tinkerspend/domain";
import { api, ApiFailure, newOperationId } from "../lib/api";
import { KIND_LABEL } from "../lib/format";
import type { Draft, DraftEntry, Txn } from "../lib/types";
import { isNative, Recorder } from "../native";

const MAX_MS = 60_000;
const MAX_BYTES = 3 * 1024 * 1024;
const NOTE: Record<string, string> = {
  amount_missing: "Amount not found — enter it.", amount_unclear: "Amount unclear — check it.", amount_not_in_source: "The suggested amount wasn't in what you said — enter it.",
  multiple_amounts: "Several numbers in one item — enter the right amount.", date_assumed_reference_day: "No date mentioned — assumed the day you recorded/typed it.",
  date_unclear: "Date unclear — pick it.", non_inr_currency: "Not in rupees — enter the INR amount.", nothing_extracted: "Nothing recognised — fill it in or discard.",
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

  const load = () => api<{ items: Draft[] }>("GET", "/drafts").then((r) => setDrafts(r.items)).catch((e) => setErr(errText(e)));
  useEffect(() => { load(); return () => { if (timer.current) clearInterval(timer.current); }; }, []);

  async function extractText(t: string, referenceTime: number) {
    setBusy(true); setErr(null); setInfo(null);
    try {
      const r = await api<{ drafts: Draft[]; method: string; note: string | null }>("POST", "/drafts/text", { operation_id: newOperationId(), text: t, reference_time: referenceTime, timezone: tz() });
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
    setRec({ ...rec, state: "uploading" }); setErr(null);
    try {
      await api("POST", "/drafts/voice", { operation_id: voiceOp.current, reference_time: rec.startedAt, timezone: tz(), mime_type: rec.blob.type || "audio/webm", data_base64: await blobToBase64(rec.blob), duration_ms: Math.max(1, rec.durationMs) });
      URL.revokeObjectURL(rec.url); setRec({ state: "idle" }); await load();
    } catch (e) {
      // Keep the recording so nothing is lost; a new attempt uses a new operation only when the user asks.
      setRec({ ...rec, state: "recorded" }); voiceOp.current = newOperationId();
      setErr(e instanceof ApiFailure && e.code === "outcome_unknown" ? "Transcription didn't answer in time and won't be retried automatically. Try again or type it." : errText(e));
    }
  }

  return (
    <section className="card" aria-label="Quick add">
      <h2>Quick add</h2>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void extractText(text.trim(), Date.now()); }}>
        <label>Describe expenses<textarea rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Yesterday, lunch 180 and auto 80" /></label>
        <div className="row">
          <button type="submit" disabled={busy || !text.trim()}>{busy ? "Reading…" : "Make drafts"}</button>
          {rec.state === "idle" && <button type="button" className="secondary" onClick={startRec}>Record</button>}
          {rec.state === "recording" && <>
            <button type="button" onClick={() => stopRec(rec.startedAt)}>Stop ({Math.floor(elapsed / 1000)}s / 60s)</button>
            <button type="button" className="secondary" onClick={cancelRec}>Cancel</button>
          </>}
        </div>
      </form>
      {(rec.state === "recorded" || rec.state === "uploading") && (
        <div className="row" aria-label="Recording">
          <audio controls src={rec.url} />
          <span className="muted">{(rec.durationMs / 1000).toFixed(1)}s</span>
          <button disabled={rec.state === "uploading"} onClick={upload}>{rec.state === "uploading" ? "Transcribing…" : "Transcribe"}</button>
          <button className="secondary" disabled={rec.state === "uploading"} onClick={cancelRec}>Discard recording</button>
        </div>
      )}
      {err && <p role="alert" className="error">{err}</p>}
      {info && <p className="muted" role="status">{info}</p>}
      {drafts.length > 0 && <h3>Drafts — nothing is saved until you press Save</h3>}
      {drafts.map((d) => <DraftCard key={`${d.id}-${d.version}`} d={d} onChanged={load} onSaved={(t) => { onSaved(t); void load(); }} onReextract={(t) => extractText(t, d.reference_at).then(() => api("POST", `/drafts/${d.id}/discard`)).then(load)} />)}
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
  const set = <K extends keyof DraftEntry>(k: K, v: DraftEntry[K]) => setE({ ...e, [k]: v });
  const dirty = (Object.keys(e) as (keyof DraftEntry)[]).filter((k) => JSON.stringify(e[k]) !== JSON.stringify(d.entry[k]));

  async function save() {
    setBusy(true); setErr(null);
    try {
      let version = d.version;
      if (dirty.length) {
        const patch = Object.fromEntries(dirty.map((k) => [k, e[k]]));
        version = (await api<{ draft: Draft }>("PATCH", `/drafts/${d.id}`, { version, entry: patch })).draft.version;
      }
      const r = await api<{ transaction: Txn }>("POST", `/drafts/${d.id}/commit`, { operation_id: opId, version, paid_confirmed: paid });
      onSaved(r.transaction);
    } catch (x) {
      const f = x instanceof ApiFailure ? (x.details as Record<string, string> | undefined) : undefined;
      setErr(f?.paid_confirmed ? "Tick “I paid this” to save it as spending." : f?.amount ? "Enter the amount." : f?.effective_local_date ? "Pick the date." : (x as Error).message);
      onChanged();
    } finally { setBusy(false); }
  }

  return (
    <article className="txn draft" data-testid="draft" aria-label={`Draft ${e.description ?? ""}`}>
      <div className="draft-main">
        <label className="big">Amount (₹)<input inputMode="decimal" value={e.amount ?? ""} onChange={(x) => set("amount", x.target.value || null)} /></label>
        <label className="big">Date<input type="date" value={e.effective_local_date ?? ""} onChange={(x) => set("effective_local_date", x.target.value || null)} /></label>
      </div>
      <label>What<input value={e.description ?? ""} maxLength={500} onChange={(x) => set("description", x.target.value || null)} /></label>
      <div className="row">
        <label>Type<select value={e.kind} onChange={(x) => set("kind", x.target.value as DraftEntry["kind"])}>{(["expense", "income", "transfer", "unknown"] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        {e.kind === "expense" && <label>Category<select aria-label="Draft category" value={e.category_id ?? "uncategorized"} onChange={(x) => set("category_id", x.target.value as CategoryId)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      </div>
      {d.assumptions.filter((a) => NOTE[a]).map((a) => <p key={a} className="warn">{NOTE[a]}</p>)}
      <p className="muted">{d.source === "voice" ? "From voice" : "From text"} · {d.extraction === "ai" ? "AI-extracted" : "parsed without AI"}{d.input_text ? ` · “${d.input_text}”` : ""}</p>
      {d.transcript !== null && (
        <details><summary>Transcript</summary>
          <textarea rows={2} value={transcript} onChange={(x) => setTranscript(x.target.value)} aria-label="Transcript" />
          <button className="secondary" disabled={!transcript.trim() || transcript === d.transcript} onClick={() => onReextract(transcript.trim())}>Re-read edited transcript</button>
        </details>
      )}
      {e.kind === "expense" && <label className="check"><input type="checkbox" checked={paid} onChange={(x) => setPaid(x.target.checked)} /> I paid this</label>}
      {err && <p role="alert" className="error">{err}</p>}
      <div className="row">
        <button disabled={busy} onClick={save}>Save</button>
        <button className="secondary" disabled={busy} onClick={() => api("POST", `/drafts/${d.id}/discard`).then(onChanged)}>Discard</button>
      </div>
    </article>
  );
}
