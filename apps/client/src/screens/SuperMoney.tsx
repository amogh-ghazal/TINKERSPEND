import { useState } from "react";

export function SuperMoney({ onShare }: { onShare: () => void }) {
  const [sheet, setSheet] = useState<"closed" | "share" | "whatsapp">("closed");
  const [message, setMessage] = useState("Sent you payment via UPI using SuperMoney. Let me know when you get it.");
  const [selected, setSelected] = useState(false);
  return (
    <section className="supermoney-screen" aria-label="SuperMoney concept demo">
      <div className="sm-phone">
        <div className="sm-status"><span>5:31</span><span>●●●  ▰  14</span></div>
        <div className="sm-toolbar"><button aria-label="Back">‹</button><span className="sm-demo">TINKERSPEND DEMO</span><button aria-label="Share payment" onClick={() => setSheet("share")}><ShareIcon /></button><button aria-label="Messages">▢</button></div>
        <div className="sm-success-icon" aria-hidden="true"><span>✓</span></div>
        <h2>Payment successful</h2>
        <p className="sm-to">to Vineesh (demo)</p>
        <strong className="sm-amount">₹3,500</strong>
        <div className="sm-cashback">💸 <span>You earned ₹1.5 cashback</span></div>
        <p className="sm-date">23 October 2026 · 05:26 PM</p>
        <p className="sm-utr">Demo UPI reference · 10526</p>
        <button className="sm-details">View Details</button>
        <div className="sm-actions"><button>Pay Again</button><button>Done</button></div>
        <div className="sm-powered">Powered by <b>UPI</b><i /> <b>RuPay</b><i /> <b>YES BANK</b></div>
      </div>
      {sheet !== "closed" && <div className="sm-overlay" role="presentation" onClick={() => setSheet("closed")}>
        <div className={`sm-sheet${sheet === "whatsapp" ? " sm-contact-sheet" : ""}`} role="dialog" aria-modal="true" aria-label={sheet === "share" ? "Share demo payment" : "Send demo payment to WhatsApp"} onClick={(e) => e.stopPropagation()}>
          {sheet === "share" ? <>
            <div className="sm-grabber" /><div className="sm-sheet-head"><strong>Share payment</strong><button onClick={() => setSheet("closed")} aria-label="Close share menu">×</button></div>
            <div className="sm-share-preview"><div className="sm-mini-check">✓</div><div><strong>₹3,500 payment</strong><span>Vineesh (demo) · SuperMoney</span></div><span className="sm-file">PNG · Demo receipt</span></div>
            <p className="sm-section-label">SHARE TO</p>
            <div className="sm-share-targets">
              <button onClick={() => setSheet("whatsapp")}><span className="sm-app-icon whatsapp-icon">◔</span>WhatsApp</button>
              <button onClick={() => setSheet("whatsapp")}><span className="sm-app-icon messages-icon">•••</span>Messages</button>
              <button onClick={() => setSheet("whatsapp")}><span className="sm-app-icon mail-icon">✉</span>Mail</button>
              <button onClick={() => setSheet("whatsapp")}><span className="sm-app-icon more-icon">↗</span>More</button>
            </div>
            <div className="sm-share-actions"><button>Copy</button><button>Save image</button><button>View more</button></div>
          </> : <>
            <div className="sm-grabber" /><div className="sm-sheet-head"><button className="sm-close" onClick={() => setSheet("share")} aria-label="Back">‹</button><strong>Send to</strong><button className="sm-group">New group</button></div>
            <div className="sm-search">⌕ <span>Search</span></div><p className="sm-section-label">FREQUENTLY CONTACTED</p>
            <button className={`sm-contact${selected ? " selected" : ""}`} onClick={() => setSelected((v) => !v)}><span className="sm-contact-avatar">A</span><span><strong>Amogh (You)</strong><small>Personal chat · demo</small></span><i>{selected ? "✓" : ""}</i></button>
            <div className="sm-message-preview"><div className="sm-mini-check">✓</div><textarea aria-label="Edit shared message" value={message} onChange={(e) => setMessage(e.target.value)} /><span className="sm-demo-thumb">DEMO RECEIPT</span></div>
            <div className="sm-send-row"><span>Amogh (You)</span><button disabled={!selected || !message.trim()} onClick={onShare}>Send <span>➤</span></button></div>
            <small className="sm-disclaimer">Concept demo · no real payment or WhatsApp message is sent.</small>
          </>}
        </div>
      </div>}
    </section>
  );
}

function ShareIcon() { return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="m8.7 10.7 6.5-4.2m-6.5 7.1 6.5 4" stroke="currentColor" strokeWidth="1.8"/></svg>; }
