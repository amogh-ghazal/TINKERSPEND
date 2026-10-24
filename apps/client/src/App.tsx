import { useCallback, useEffect, useRef, useState } from "react";
import { currentUser, renderWebSignIn, signInNative } from "./lib/auth";
import { thisMonth } from "./lib/format";
import type { Me } from "./lib/types";
import { isNative } from "./native";
import { CaptureStatusPanel } from "./screens/CaptureStatusPanel";
import { Ledger } from "./screens/Ledger";
import { Overview } from "./screens/Overview";
import { Settings } from "./screens/Settings";
import { TxnForm } from "./screens/TxnForm";
import { QuickAdd } from "./screens/QuickAdd";

type Tab = "overview" | "ledger" | "review" | "add" | "capture" | "account";

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => { currentUser().then(setMe); }, []);
  if (me === undefined) return <main className="container"><p>Loading…</p></main>;
  if (!me) return <SignIn onUser={setMe} />;
  return <Home me={me} onSignedOut={() => setMe(null)} />;
}

function SignIn({ onUser }: { onUser: (u: Me) => void }) {
  const btn = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!isNative && btn.current) renderWebSignIn(btn.current, onUser, setErr).catch((e) => setErr(e.message)); }, [onUser]);
  return (
    <main className="container narrow">
      <h1>TinkerSpend</h1>
      <p>One ledger for payment notifications, receipts, voice and typed expenses. Access is limited to invited Google accounts.</p>
      {isNative ? <button disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { onUser(await signInNative()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>Sign in with Google</button> : <div ref={btn} />}
      {err && <p className="error" role="alert">{err}</p>}
    </main>
  );
}

function Home({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState(thisMonth(me.timezone));
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  const tabs: [Tab, string][] = [["overview", "Overview"], ["ledger", "Transactions"], ["review", "Review"], ["add", "Add"], ...(isNative ? [["capture", "Capture"] as [Tab, string]] : []), ["account", "Account"]];
  return (
    <main className="container">
      <header className="row between"><h1>TinkerSpend</h1></header>
      <nav className="tabs" aria-label="Sections">{tabs.map(([t, l]) => <button key={t} className={tab === t ? "" : "secondary"} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{l}</button>)}</nav>
      {tab === "overview" && <Overview key={rev} month={month} setMonth={setMonth} onOpenReview={() => setTab("review")} />}
      {(tab === "ledger" || tab === "review") && <Ledger key={`${tab}-${rev}`} month={month} reviewOnly={tab === "review"} onChanged={bump} />}
      {tab === "add" && <QuickAdd onSaved={(t) => { setMonth(t.effective_local_date.slice(0, 7)); bump(); }} />}
      {tab === "add" && <section className="card"><h2>Add expense</h2><TxnForm key={rev} onDone={(t) => { setMonth(t.effective_local_date.slice(0, 7)); bump(); setTab("ledger"); }} /></section>}
      {tab === "capture" && <CaptureStatusPanel />}
      {tab === "account" && <Settings me={me} onSignedOut={onSignedOut} />}
    </main>
  );
}
