import React, { useEffect, useState } from "react";
import { Inert, pretty } from "../lib/Inert.jsx";

// The requests and responses of the scorecard on screen, each with a W3C traceparent. Secrets are redacted by the server; text is shown, never run.
export default function RawTab({ app }) {
  const { card } = app;
  const msgs = card?.trace?.messages || [];
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [card]);
  const i = Math.min(idx, msgs.length - 1);
  const m = msgs[i];
  return (
    <>
      <h2>Raw messages</h2>
      <p className="lede" data-admin-only>The requests the lab made and what came back, in order. Authorization and Cookie values are redacted; invisible characters appear as chips.</p>
      {!m ? <p className="muted" data-testid="raw-empty">No messages yet. Score a target or run a story first.</p> : (
        <>
          <div className="card controls">
            <label htmlFor="raw-msg">Message
              <select id="raw-msg" value={i} onChange={(e) => setIdx(Number(e.target.value))}>{msgs.map((x, k) => <option key={x.seq} value={k}>{k + 1} {x.label}</option>)}</select>
            </label>
            <span className="muted small">{msgs.length} messages</span>
          </div>
          <p className="muted small">traceparent <code data-testid="raw-traceparent">{m.traceparent}</code></p>
          <div className="cols">
            <section className="card"><h3>Request</h3><Inert block text={pretty(m.request)} testid="raw-request" /></section>
            <section className="card"><h3>Response</h3><Inert block text={pretty(m.response)} testid="raw-response" /></section>
          </div>
        </>
      )}
    </>
  );
}
