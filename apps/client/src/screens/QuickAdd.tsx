import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type CategoryId } from "@tinkerspend/domain";
import { api, ApiFailure, newOperationId } from "../lib/api";
import { categoryName, KIND_LABEL } from "../lib/format";
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
type ChatTurn = { id: number; from: "person" | "assistant"; text: string; media?: { type: "image" | "audio"; url: string; durationMs?: number }; payment?: boolean; replyDraftId?: string };
const DEMO_PAYMENT = { amount: "₹3,500", payee: "Vineesh (demo)", time: "23 October 2026 · 05:26 PM", reference: "DEMO-10526" };

export function QuickAdd({ onSaved, onExit, shareToken = 0, onShareHandled = () => undefined }: { onSaved: (t: Txn) => void; onExit: () => void; shareToken?: number; onShareHandled?: (token: number) => void }) {
  const [text, setText] = useState("");
  const [attachMenu, setAttachMenu] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rec, setRec] = useState<Rec>({ state: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const mr = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  const timer = useRef<number | null>(null);
  const recordingStartedAt = useRef<number | null>(null);
  const recordingReady = useRef(false);
  const recordingEndStarted = useRef(false);
  const ownedUrls = useRef<string[]>([]);
  const hold = useRef<{ pointerId: number | null; startX: number; cancelled: boolean; released: boolean }>({ pointerId: null, startX: 0, cancelled: false, released: false });
  const voiceOp = useRef<string>(newOperationId());
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; takenAt: number; op: string; busy: boolean } | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [reply, setReply] = useState<{ draftId: string; expiresAt: number } | null>(null);
  const [clock, setClock] = useState(Date.now());
  const lastShareToken = useRef(0);
  const nextTurnId = useRef(1);
  const trackUrl = (url: string) => { ownedUrls.current.push(url); return url; };
  const releaseUrl = (url: string) => { ownedUrls.current = ownedUrls.current.filter((item) => item !== url); URL.revokeObjectURL(url); };
  const addTurn = (from: ChatTurn["from"], message: string, media?: ChatTurn["media"], extra: Pick<ChatTurn, "payment" | "replyDraftId"> = {}) => setTurns((items) => [...items, { id: nextTurnId.current++, from, text: message, media, ...extra }]);

  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      const blob = await normalizeReceipt(f);
      const t = Date.now();
      const takenAt = f.lastModified && f.lastModified <= t && f.lastModified > t - 29 * 86_400_000 ? f.lastModified : t;
      if (photo) releaseUrl(photo.url);
      setPhoto({ blob, url: trackUrl(URL.createObjectURL(blob)), takenAt, op: newOperationId(), busy: false });
    } catch (e) { setErr((e as Error).message); }
  }

  async function readReceipt() {
    if (!photo) return;
    setPhoto({ ...photo, busy: true }); setErr(null);
    try {
      const r = await api<{ drafts: Draft[] }>("POST", "/drafts/receipt", { operation_id: photo.op, reference_time: photo.takenAt, timezone: tz(), mime_type: "image/jpeg", data_base64: await blobToBase64(photo.blob) });
      for (const d of r.drafts) await saveReceipt(d.id, photo.blob).catch(() => undefined);
      addTurn("person", "", { type: "image", url: photo.url });
      addTurn("assistant", "Receipt scanned. Review the expense draft below before saving.");
      setPhoto(null); await load();
    } catch (e) {
      setPhoto({ ...photo, busy: false, op: newOperationId() });
      setErr(e instanceof ApiFailure && e.code === "outcome_unknown" ? "Receipt reading didn't answer in time and won't be retried automatically. Try again or enter it manually." : errText(e));
    }
  }

  const load = () => api<{ items: Draft[] }>("GET", "/drafts").then((r) => setDrafts(r.items)).catch((e) => setErr(errText(e)));
  useEffect(() => { load(); return () => { if (timer.current) clearInterval(timer.current); for (const url of ownedUrls.current) URL.revokeObjectURL(url); }; }, []);

  useEffect(() => {
    if (!reply) return;
    const id = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [reply]);

  useEffect(() => {
    if (!shareToken || lastShareToken.current === shareToken) return;
    lastShareToken.current = shareToken;
    const referenceTime = Date.now();
    setBusy(true); setErr(null);
    api<{ drafts: Draft[] }>("POST", "/drafts/demo-payment", { operation_id: newOperationId(), reference_time: referenceTime, timezone: tz() }).then(async (r) => {
      const d = r.drafts[0];
      if (!d) throw new Error("The demo payment could not be prepared.");
      setDrafts((items) => [d, ...items.filter((item) => item.id !== d.id)]);
      setReply({ draftId: d.id, expiresAt: Date.now() + 30_000 });
      addTurn("person", "", undefined, { payment: true });
      addTurn("assistant", `Noted — ${DEMO_PAYMENT.amount} sent to ${DEMO_PAYMENT.payee} on ${DEMO_PAYMENT.time}. What was this for? Reply here within 30 seconds and I’ll attach the purpose to this payment.`, undefined, { replyDraftId: d.id });
    }).catch((e) => setErr(errText(e))).finally(() => { setBusy(false); onShareHandled(shareToken); });
  }, [shareToken]);

  async function extractText(t: string, referenceTime: number, replyDraftId?: string) {
    setBusy(true); setErr(null); setInfo(null);
    try {
      const r = await api<{ drafts: Draft[]; method: string; note: string | null }>("POST", "/drafts/text", { operation_id: newOperationId(), text: t, reference_time: referenceTime, timezone: tz(), ...(replyDraftId ? { reply_to_draft_id: replyDraftId } : {}) });
      addTurn("person", t, undefined, replyDraftId ? { replyDraftId } : {});
      if (replyDraftId && r.drafts[0]) {
        const d = r.drafts[0];
        setDrafts((items) => [d, ...items.filter((item) => item.id !== d.id)]);
        const category = d.entry.category_id;
        addTurn("assistant", category && category !== "uncategorized" ? `Got it — “${t}” is linked to this payment and categorized as ${categoryName(category)}. Review the updated draft below before saving.` : `Got it — “${t}” is linked to this payment. I couldn’t confidently choose a category, so please select one in the draft below.`, undefined, { replyDraftId });
        setReply(null);
      } else {
        addTurn("assistant", r.drafts.length ? "Added as a draft. Check the details below before saving." : "Couldn't find a clear expense. Try including the amount.");
        if (r.method === "deterministic" && r.note) setInfo("Parsed on the server without AI; please check each draft.");
      }
      setText(""); await load();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  async function startRec() {
    setErr(null);
    recordingStartedAt.current = null;
    try {
      if (isNative) await Recorder.start();
      else {
        const mime = pickMime();
        if (mime === null || !navigator.mediaDevices?.getUserMedia) { setErr("Voice recording isn't supported in this browser."); return; }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks: Blob[] = [];
        r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        r.start(); mr.current = { rec: r, chunks, stream };
      }
      const startedAt = Date.now();
      recordingStartedAt.current = startedAt;
      voiceOp.current = newOperationId();
      recordingReady.current = true;
      setRec({ state: "recording", startedAt }); setElapsed(0);
      timer.current = window.setInterval(() => { const ms = Date.now() - startedAt; setElapsed(ms); if (ms >= MAX_MS) void finishRec(startedAt); }, 250);
    } catch (e) {
      const denied = (e as { code?: string; name?: string }).code === "permission_denied" || (e as { name?: string }).name === "NotAllowedError";
      setErr(denied ? "Microphone permission was denied. You can allow it in settings, or type the expense." : "Could not start recording.");
    }
  }

  async function finishRec(startedAt: number) {
    if (!recordingReady.current || recordingEndStarted.current) return;
    recordingEndStarted.current = true;
    recordingReady.current = false;
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
      if (durationMs < 350) { setRec({ state: "idle" }); setErr("Hold the microphone a little longer to record a voice message."); return; }
      const recording = { state: "recorded" as const, startedAt, blob, durationMs, url: trackUrl(URL.createObjectURL(blob)) };
      setRec(recording);
      await uploadRecording(recording);
    } catch (e) { setRec({ state: "idle" }); setErr((e as { code?: string }).code === "too_short" ? "Hold the microphone a little longer to record a voice message." : "Recording failed."); }
    finally { recordingEndStarted.current = false; hold.current = { pointerId: null, startX: 0, cancelled: false, released: false }; }
  }

  async function cancelRec(showSwipeHint = false) {
    recordingReady.current = false;
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (isNative) await Recorder.cancel().catch(() => undefined);
    else if (mr.current) { mr.current.rec.stop(); mr.current.stream.getTracks().forEach((t) => t.stop()); mr.current = null; }
    if (rec.state === "recorded") releaseUrl(rec.url);
    setRec({ state: "idle" });
    hold.current = { pointerId: null, startX: 0, cancelled: false, released: false };
    if (showSwipeHint) setInfo("Recording deleted");
  }

  async function uploadRecording(recording: Extract<Rec, { state: "recorded" }>) {
    setRec({ ...recording, state: "uploading" }); setErr(null);
    try {
      const replyDraftId = reply && recording.startedAt <= reply.expiresAt ? reply.draftId : undefined;
      const result = await api<{ drafts?: Draft[]; transcript?: string }>("POST", "/drafts/voice", { operation_id: voiceOp.current, reference_time: recording.startedAt, timezone: tz(), mime_type: recording.blob.type || "audio/webm", data_base64: await blobToBase64(recording.blob), duration_ms: Math.max(1, recording.durationMs), ...(replyDraftId ? { reply_to_draft_id: replyDraftId } : {}) });
      addTurn("person", "", { type: "audio", url: recording.url, durationMs: recording.durationMs });
      if (replyDraftId && result.drafts?.[0]) {
        const d = result.drafts[0]; setDrafts((items) => [d, ...items.filter((item) => item.id !== d.id)]);
        const category = d.entry.category_id;
        addTurn("assistant", category && category !== "uncategorized" ? `Voice note linked to this payment and categorized as ${categoryName(category)}. Review the updated draft below.` : "Voice note linked to this payment. The purpose is saved, but its category still needs your choice.", undefined, { replyDraftId });
        setReply(null);
      } else addTurn("assistant", "Voice note transcribed. Check the expense draft below before saving.");
      setRec({ state: "idle" }); await load();
    } catch (e) {
      setRec({ ...recording, state: "recorded" });
      voiceOp.current = newOperationId();
      setErr(e instanceof ApiFailure && e.code === "outcome_unknown" ? "Transcription didn't answer in time and won't be retried automatically. Try again or type it." : errText(e));
    }
  }

  async function beginHold(pointerId: number, startX: number) {
    if (rec.state !== "idle" || photo || busy) return;
    setErr(null); setInfo(null);
    hold.current = { pointerId, startX, cancelled: false, released: false };
    await startRec();
    if (hold.current.pointerId !== pointerId) return;
    if (hold.current.cancelled) await cancelRec(true);
    else if (hold.current.released && recordingStartedAt.current !== null) await finishRec(recordingStartedAt.current);
  }

  function releaseHold(pointerId: number) {
    if (hold.current.pointerId !== pointerId || hold.current.cancelled) return;
    hold.current.released = true;
    if (recordingReady.current && rec.state === "recording") void finishRec(rec.startedAt);
  }

  function moveHold(pointerId: number, clientX: number) {
    if (hold.current.pointerId !== pointerId || hold.current.cancelled) return;
    if (clientX <= hold.current.startX - 82) {
      hold.current.cancelled = true;
      if (recordingReady.current) void cancelRec(true);
    }
  }

  return (
    <section className="whatsapp-chat" aria-label="WhatsApp concept demo">
      <div className="chat-frame">
        <div className="chat-topbar">
          <button type="button" className="chat-back" aria-label="Back to TinkerSpend" onClick={onExit}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6M9 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          <div className="chat-avatar" aria-hidden="true">T</div>
          <div className="chat-contact"><strong>TinkerSpend</strong><span>WhatsApp-style concept demo</span></div>
          <span className="chat-demo-label">DEMO</span>
        </div>

        {photo ? <div className="photo-stage" aria-label="Photo preview before sending">
          <button type="button" className="photo-close" aria-label="Cancel photo" disabled={photo.busy} onClick={() => { releaseUrl(photo.url); setPhoto(null); }}>×</button>
          <img src={photo.url} alt="Selected receipt preview" />
          <span className="photo-demo-note">TinkerSpend demo</span>
        </div> : <div className="chat-wall">
          <div className="chat-day">TODAY</div>
          {turns.length === 0 && <div className="chat-empty-note">Send a message, receipt or voice note</div>}
          <div className="chat-thread" aria-live="polite">
            {turns.map((turn) => <div className={`chat-message ${turn.from}`} key={turn.id}>
              {turn.payment && <DemoPaymentCard />}
              {turn.media?.type === "image" && <img className="chat-sent-image" src={turn.media.url} alt="Receipt sent in chat" />}
              {turn.media?.type === "audio" && <VoiceMessage url={turn.media.url} durationMs={turn.media.durationMs ?? 0} seed={turn.id} />}
              {turn.text && <p>{turn.text}</p>}
              {turn.replyDraftId && Date.now() <= (reply?.expiresAt ?? 0) && <button type="button" className="chat-reply-link" onClick={() => { const d = drafts.find((item) => item.id === turn.replyDraftId); if (d) setReply({ draftId: d.id, expiresAt: reply?.expiresAt ?? Date.now() + 30_000 }); }}>Reply about this payment</button>}
              <small className="chat-time">{turn.from === "person" ? "You · " : "TinkerSpend · "}now <span aria-hidden="true">{turn.from === "person" ? "✓✓" : ""}</span></small>
            </div>)}
            {drafts.length > 0 && <div className="whatsapp-drafts"><p className="chat-day">EXPENSES TO REVIEW</p>{drafts.map((d) => <DraftCard key={`${d.id}-${d.version}`} d={d} onChanged={load} onSaved={(t) => { onSaved(t); void load(); }} onReextract={(t) => extractText(t, d.reference_at).then(() => api("POST", `/drafts/${d.id}/discard`)).then(load)} />)}</div>}
          </div>
          {rec.state === "recording" && <div className="recording-gesture" role="status"><span className="recording-dot" /> {Math.floor(elapsed / 1000)}s <span>← Slide to cancel · release to send</span></div>}
          {err && <p role="alert" className="chat-notice chat-error">{err}</p>}
          {info && <p className="chat-notice" role="status">{info}</p>}
          {reply && clock <= reply.expiresAt && <div className="chat-reply-context"><span>↪ Replying to ₹3,500 SuperMoney payment · {Math.max(0, Math.ceil((reply.expiresAt - clock) / 1000))}s left</span><button type="button" aria-label="Cancel reply" onClick={() => setReply(null)}>×</button></div>}
        </div>}

        {photo ? <div className="photo-sendbar"><span>Receipt photo</span><button type="button" className="chat-send" aria-label="Send photo" disabled={photo.busy} onClick={() => void readReceipt()}>{photo.busy ? "…" : "➤"}</button></div> : <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !busy) void extractText(text.trim(), Date.now(), reply && Date.now() <= reply.expiresAt ? reply.draftId : undefined); }}>
          <div className="chat-attach-wrap"><button type="button" className="chat-tool chat-plus" aria-label="Open attachments" aria-expanded={attachMenu} title="Attach" onClick={() => setAttachMenu((open) => !open)}>＋</button>{attachMenu && <div className="chat-attach-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setAttachMenu(false); document.getElementById("receipt-photo")?.click(); }}>Photos &amp; videos</button></div>}</div>
          <input id="receipt-photo" hidden type="file" accept="image/jpeg,image/png" capture="environment" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <label className="sr-only" htmlFor="expense-message">Message</label>
          <input id="expense-message" className="chat-text" type="text" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" autoComplete="off" />
          {rec.state === "recorded" && <div className="voice-retry"><audio controls src={rec.url} /><button type="button" aria-label="Send voice message" onClick={() => void uploadRecording(rec)}>➤</button><button type="button" aria-label="Delete voice message" onClick={() => void cancelRec()}>×</button></div>}
          {rec.state === "uploading" && <span className="chat-send-status" role="status">Sending voice message…</span>}
          <div className="chat-tools">
            {rec.state === "idle" && !text.trim() && <button type="button" className="chat-tool chat-camera" aria-label="Take or attach a receipt photo" title="Camera or gallery" onClick={() => document.getElementById("receipt-photo")?.click()}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true"><path d="M4 7.5h3l1.5-2h7l1.5 2h3A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="13.5" r="3.5" stroke="currentColor" strokeWidth="1.7"/></svg></button>}
            {rec.state === "idle" && (text.trim() ? <button type="submit" className="chat-send" aria-label="Send message" disabled={busy}>{busy ? "…" : "➤"}</button> : <button type="button" className={`chat-tool record-tool${recordingReady.current ? " recording" : ""}`} aria-label="Hold to record a voice message" title="Hold to record · release to send" aria-pressed={recordingReady.current} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void beginHold(e.pointerId, e.clientX); }} onPointerMove={(e) => moveHold(e.pointerId, e.clientX)} onPointerUp={(e) => releaseHold(e.pointerId)} onPointerCancel={(e) => { if (hold.current.pointerId === e.pointerId) { hold.current.cancelled = true; void cancelRec(true); } }} onKeyDown={(e) => { if ((e.code === "Space" || e.code === "Enter") && !e.repeat) { e.preventDefault(); void beginHold(-1, 0); } }} onKeyUp={(e) => { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); releaseHold(-1); } }}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button>)}
          </div>
        </form>}
      </div>
    </section>
  );
}

function DemoPaymentCard() {
  return <div className="chat-payment-card" aria-label="Synthetic SuperMoney payment receipt demo">
    <div className="chat-payment-head"><span>SuperMoney</span><b>DEMO</b></div>
    <div className="chat-payment-check">✓</div><strong>Payment successful</strong><span>to {DEMO_PAYMENT.payee}</span><b className="chat-payment-amount">{DEMO_PAYMENT.amount}</b>
    <div className="chat-payment-cashback">You earned ₹1.5 cashback</div><small>{DEMO_PAYMENT.time}</small><small>UPI ref · {DEMO_PAYMENT.reference}</small>
  </div>;
}

function VoiceMessage({ url, durationMs, seed }: { url: string; durationMs: number; seed: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const bars = Array.from({ length: 30 }, (_, i) => 7 + ((i * 17 + seed * 13) % 19));
  return <div className="voice-bubble">
    <button type="button" className="voice-play" aria-label={playing ? "Pause voice message" : "Play voice message"} onClick={() => { const player = audio.current; if (!player) return; if (player.paused) void player.play(); else player.pause(); }}>{playing ? "Ⅱ" : "▶"}</button>
    <span className="voice-wave" role="progressbar" aria-label="Voice message playback" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>{bars.map((height, i) => <i key={i} style={{ height: `${height}px`, opacity: i / bars.length <= progress ? 1 : .6 }} />)}</span>
    <small>{playing ? `${elapsed.toFixed(0)}s` : `${(durationMs / 1000).toFixed(0)}s`}</small>
    <audio ref={audio} preload="metadata" src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(e) => { const player = e.currentTarget; setElapsed(player.currentTime); setProgress(player.duration ? player.currentTime / player.duration : 0); }} onEnded={() => { setPlaying(false); setProgress(0); setElapsed(0); }} />
  </div>;
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
      {d.demo && <p className="demo-draft-badge">Synthetic SuperMoney demo data · review before saving</p>}
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
