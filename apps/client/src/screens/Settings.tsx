import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { signOut } from "../lib/auth";
import { isNative, AuthBridge } from "../native";
import type { Me } from "../lib/types";

interface Device { id: string; label: string | null; created_at: number; last_seen_at: number | null; revoked_at: number | null }
interface WhatsAppStatus { linked: boolean; linked_at: number | null }

export function Settings({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [whatsApp, setWhatsApp] = useState<WhatsAppStatus | null>(null);
  const [linkCode, setLinkCode] = useState<{ code: string; expires_at: number } | null>(null);
  const load = () => api<{ items: Device[] }>("GET", "/devices").then((r) => setDevices(r.items), () => {});
  const loadWhatsApp = () => api<WhatsAppStatus>("GET", "/whatsapp/status").then(setWhatsApp, () => {});
  useEffect(() => { void load(); void loadWhatsApp(); }, []);

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
      purge = confirm(`Delete not-yet-synced captured payments and receipt photos on this phone?${count ? ` (${count} from another account)` : ""}\nOK = delete, Cancel = keep them encrypted for this account only.`);
    } else {
      purge = confirm("Delete receipt photos stored in this browser?\nOK = delete, Cancel = keep them (only this account's receipts can show them).");
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
  async function createWhatsAppLink() {
    const result = await api<{ code: string; expires_at: number }>("POST", "/whatsapp/link", {});
    setLinkCode(result); setMsg("Send the displayed LINK message to your configured TinkerSpend WhatsApp number within 10 minutes.");
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
      <h3>WhatsApp personal intake</h3>
      {whatsApp?.linked ? <p className="muted">Your WhatsApp number is linked. Text, receipt photos and voice notes create reviewable drafts.</p> : <p className="muted">Link your own WhatsApp number after the Meta WhatsApp webhook is configured.</p>}
      {!whatsApp?.linked && <button className="secondary" onClick={() => void createWhatsAppLink()}>Generate WhatsApp link code</button>}
      {linkCode && <p role="status"><strong>LINK {linkCode.code}</strong><br />Send this exact message to the TinkerSpend WhatsApp number before {new Date(linkCode.expires_at).toLocaleTimeString()}.</p>}
      {msg && <p role="status">{msg}</p>}
      <h3>Danger zone</h3>
      <button className="secondary danger" onClick={deleteAccount}>Delete my data</button>
    </section>
  );
}
