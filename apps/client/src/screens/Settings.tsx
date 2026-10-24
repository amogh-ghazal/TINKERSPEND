import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { signOut } from "../lib/auth";
import { isNative, AuthBridge } from "../native";
import type { Me } from "../lib/types";

interface Device { id: string; label: string | null; created_at: number; last_seen_at: number | null; revoked_at: number | null }

export function Settings({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<{ items: Device[] }>("GET", "/devices").then((r) => setDevices(r.items), () => {});
  useEffect(() => { void load(); }, []);

  async function exportCsv() {
    const csv = await api<string>("GET", "/export.csv");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `tinkerspend-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  async function logout() {
    let purge = false;
    if (isNative) {
      const { count } = await AuthBridge.pendingForOtherAccounts().catch(() => ({ count: 0 }));
      purge = confirm(`Delete not-yet-synced captured payments on this phone?${count ? ` (${count} from another account)` : ""}\nOK = delete, Cancel = keep them encrypted for this account only.`);
    }
    await signOut(purge); onSignedOut();
  }
  async function deleteAccount() {
    if (prompt('Type DELETE to permanently delete your TinkerSpend data from the server.') !== "DELETE") return;
    await api("DELETE", "/account");
    await signOut(true); onSignedOut();
  }
  async function revoke(d: Device) {
    if (!confirm(`Revoke ${d.label ?? "device"}? It will stop syncing until signed in again.`)) return;
    await api("DELETE", `/devices/${d.id}`); setMsg("Device revoked"); void load();
  }

  return (
    <section className="card" aria-labelledby="set-h">
      <h2 id="set-h">Account</h2>
      <p>Signed in as <strong>{me.email}</strong> · Time zone {me.timezone}</p>
      <div className="row"><button className="secondary" onClick={exportCsv}>Export CSV</button><button className="secondary" onClick={logout}>Sign out</button></div>
      <h3>Android devices</h3>
      {devices.length === 0 ? <p className="muted">No Android devices registered.</p> : (
        <ul className="plain">{devices.map((d) => <li key={d.id} className="row between"><span>{d.label ?? "Android"} {d.revoked_at ? "(revoked)" : ""}</span>{!d.revoked_at && <button className="secondary" onClick={() => revoke(d)}>Revoke</button>}</li>)}</ul>
      )}
      {msg && <p role="status">{msg}</p>}
      <h3>Danger zone</h3>
      <button className="secondary danger" onClick={deleteAccount}>Delete my data</button>
    </section>
  );
}
