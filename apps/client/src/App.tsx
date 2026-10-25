import { useCallback, useEffect, useRef, useState } from "react";
import { currentUser, renderWebSignIn, signInNative } from "./lib/auth";
import { thisMonth } from "./lib/format";
import type { Me } from "./lib/types";
import { isNative } from "./native";
import { Ledger } from "./screens/Ledger";
import { Overview } from "./screens/Overview";
import { Settings } from "./screens/Settings";
import { QuickAdd } from "./screens/QuickAdd";
import { SuperMoney } from "./screens/SuperMoney";

type Tab = "overview" | "whatsapp" | "supermoney" | "review" | "account";

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
  const [sharedPayment, setSharedPayment] = useState(0);
  const [handledPayment, setHandledPayment] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  useEffect(() => {
    const refresh = () => { if (tab === "overview" && document.visibilityState === "visible") bump(); };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [tab, bump]);
  const inWhatsApp = tab === "whatsapp";
  const tabs: [Tab, string][] = [["overview", "Overview"], ["whatsapp", "WhatsApp"], ["supermoney", "SuperMoney"], ["review", "Review"], ["account", "Account"]];
  return (
    <main className={`container app-shell${inWhatsApp ? " whatsapp-mode" : ""}`}>
      {!inWhatsApp && <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">T</span>
          <div><p className="eyebrow">PERSONAL FINANCE · INDIA</p><h1>TinkerSpend</h1></div>
        </div>
        <div className="privacy-pill"><span className="privacy-dot" />Private workspace</div>
        <p className="header-copy">A clearer picture of where your money goes.</p>
      </header>}
      {!inWhatsApp && <nav className="tabs" aria-label="Sections">{tabs.map(([t, l], i) => <button key={t} className={`tab${tab === t ? " active" : ""}`} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}><span>{l}</span><small aria-hidden="true">{String(i + 1).padStart(2, "0")}</small></button>)}</nav>}
      <div className={inWhatsApp ? "whatsapp-content" : "screen-content"} key={tab}>
        {tab === "overview" && <Overview key={rev} month={month} setMonth={setMonth} onOpenReview={() => setTab("review")} />}
        {tab === "whatsapp" && <QuickAdd shareToken={sharedPayment > handledPayment ? sharedPayment : 0} onShareHandled={(token) => setHandledPayment((n) => Math.max(n, token))} onExit={() => setTab("overview")} onSaved={(t) => { setMonth(t.effective_local_date.slice(0, 7)); bump(); }} />}
        {tab === "supermoney" && <SuperMoney onShare={() => { setSharedPayment((n) => n + 1); setTab("whatsapp"); }} />}
        {tab === "review" && <Ledger key={`${tab}-${rev}`} month={month} reviewOnly onChanged={bump} timezone={me.timezone} />}
        {tab === "account" && <Settings me={me} onSignedOut={onSignedOut} />}
      </div>
    </main>
  );
}
