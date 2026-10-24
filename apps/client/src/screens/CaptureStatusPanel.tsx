import { useCallback, useEffect, useState } from "react";
import { Capture, isNative, type CaptureStatus, type CapturedEventSummary, type InstalledSource } from "../native";

function fmt(ts: number | null) {
  return ts ? new Date(ts).toLocaleString("en-IN") : "never";
}

export function CaptureStatusPanel() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [sources, setSources] = useState<InstalledSource[]>([]);
  const [events, setEvents] = useState<CapturedEventSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isNative) return;
    try {
      setStatus(await Capture.getStatus());
      setSources((await Capture.listSupportedSources()).sources);
      setEvents((await Capture.recentEvents({ limit: 10 })).events);
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
  const toggle = async (pkg: string, on: boolean) => {
    const cur = new Set(status?.selectedPackages ?? []);
    if (on) cur.add(pkg); else cur.delete(pkg);
    setStatus(await Capture.setSelectedPackages({ packages: [...cur] }));
  };

  return (
    <section className="card" aria-labelledby="capture-h">
      <h2 id="capture-h">Automatic payment capture</h2>
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
        <button onClick={() => void Capture.openNotificationAccessSettings()}>Open Android notification access</button>
        <button onClick={async () => setStatus(await Capture.setCaptureEnabled({ enabled: !status?.captureEnabled }))}>{status?.captureEnabled ? "Pause capture" : "Resume capture"}</button>
        <button onClick={() => void refresh()}>Refresh</button>
      </div>
      <h3>Payment sources</h3>
      <ul className="plain">
        {sources.map((s) => (
          <li key={s.packageName}>
            <label>
              <input type="checkbox" disabled={!s.installed} checked={status?.selectedPackages.includes(s.packageName) ?? false} onChange={(e) => void toggle(s.packageName, e.target.checked)} />{" "}
              {s.label} {s.installed ? "" : "(not installed)"}
            </label>
          </li>
        ))}
      </ul>
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
