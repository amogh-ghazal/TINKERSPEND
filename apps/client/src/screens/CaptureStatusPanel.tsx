import { useCallback, useEffect, useState } from "react";
import { Capture, isNative, type CaptureStatus, type CapturedEventSummary } from "../native";

function fmt(ts: number | null) {
  return ts ? new Date(ts).toLocaleString("en-IN") : "never";
}

export function CaptureStatusPanel() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [events, setEvents] = useState<CapturedEventSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isNative) return;
    try {
      setStatus(await Capture.getStatus());
      setEvents((await Capture.recentEvents({ limit: 10 })).events);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  if (!isNative) {
    return (
      <section className="card" aria-labelledby="capture-h">
        <h2 id="capture-h">Automatic payment capture</h2>
        <p>Capturing payment notifications requires the TinkerSpend Android app. A browser cannot read other apps' notifications. You can still add expenses here by text, voice or receipt photo.</p>
      </section>
    );
  }

  const connected = !!status?.permissionGranted && !!status?.listenerConnected;
  const enable = async () => {
    setBusy(true); setError(null);
    try {
      const next = await Capture.enableAutomaticCapture();
      setStatus(next);
      if (!next.permissionGranted) await Capture.openNotificationAccessSettings();
      else await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="card" aria-labelledby="capture-h">
      <h2 id="capture-h">Automatic payment capture</h2>
      <p>Allow TinkerSpend notification access once. Supported payment and bank apps are detected automatically; there is no app-by-app permission setup.</p>
      <p>When enabled, current visible alerts and new alerts are checked on this phone. Only payment-like alerts from supported sources, including recognized bank senders in supported messaging apps, are saved and synced to your account. Personal messages, OTPs, promotions and unrelated alerts are filtered on the phone. Android may hide sensitive content.</p>
      <p className="muted">This does not read your SMS inbox or recover cleared notifications. Some bank formats are unsupported. Stored alerts are encrypted locally; bank names are reported from the alert, not independently verified. You can pause capture or revoke notification access at any time.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <dl className="kv" data-testid="capture-status">
        <dt>Notification access</dt><dd>{status?.permissionGranted ? "Granted" : "Not granted"}</dd>
        <dt>Listener</dt><dd>{connected ? "Connected" : status?.permissionGranted ? "Disconnected" : "Inactive"} (last connect {fmt(status?.lastListenerConnectAt ?? null)})</dd>
        <dt>Capture</dt><dd>{status?.captureEnabled ? "On" : "Paused"}{status?.pausedReason ? ` — ${status.pausedReason}` : ""}</dd>
        <dt>Last captured event</dt><dd>{fmt(status?.lastEventAt ?? null)}</dd>
        <dt>Last successful sync</dt><dd>{fmt(status?.lastSyncAt ?? null)}</dd>
        <dt>Pending upload</dt><dd>{status?.pendingCount ?? 0} ({status?.failedCount ?? 0} failed)</dd>
      </dl>
      <div className="row">
        {(!status?.automaticSources || !status?.permissionGranted) && <button disabled={busy} onClick={() => void enable()}>{busy ? "Opening…" : "Enable automatic capture"}</button>}
        {status?.automaticSources && <button disabled={busy} onClick={async () => {
          setBusy(true); setError(null);
          try { setStatus(await Capture.setCaptureEnabled({ enabled: !status.captureEnabled })); }
          catch (e) { setError((e as Error).message); }
          finally { setBusy(false); }
        }}>{status.captureEnabled ? "Pause capture" : "Resume capture"}</button>}
        {status?.permissionGranted && <button className="secondary" onClick={() => void Capture.openNotificationAccessSettings()}>Manage notification access</button>}
        <button onClick={() => void refresh()}>Refresh</button>
      </div>
      <p>Supported sources are recognized automatically. An ambiguous debit is logged for review; failed payments and transfers are not silently counted as spending.</p>
      <h3>Recent captured events (on this device)</h3>
      <ul className="plain" data-testid="recent-events">
        {events.length === 0 && <li>None yet.</li>}
        {events.map((e) => (
          <li key={e.eventId}><code>{e.sourcePackage}</code> · {fmt(e.capturedAt)} · {e.state}<br /><small>{e.preview}</small></li>
        ))}
      </ul>
    </section>
  );
}
