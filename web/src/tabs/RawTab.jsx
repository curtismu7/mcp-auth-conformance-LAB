import React, { useEffect, useState } from "react";
import { Json } from "../lib/ui.jsx";

// What matters in a body here: the discovery and registration fields the checks score (RFC 9728 resource, authorization server metadata, redirect URIs).
const BODY_HOT = ["resource", "authorization_servers", "code_challenge_methods_supported", "authorization_response_iss_parameter_supported", "client_id_metadata_document_supported", "redirect_uris"];

// One side of a message: method / url / status / headers in a pane, and the body (usually JSON text) in its own pane, so it gets Form | JSON too.
function Side({ part, label, testId, hot }) {
  if (!part) return <Json value={undefined} label={label} testId={testId} />; // a message with no such side stays an empty pane
  const { body, ...head } = part;
  return (
    <>
      <Json value={head} label={label} testId={testId} hot={hot} />
      {body !== undefined && <Json value={body} label={`${label} body`} testId={`${testId}-body`} hot={BODY_HOT} />}
    </>
  );
}

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
            <section className="card"><h3>Request</h3><Side part={m.request} label="Request" testId="raw-request" hot={["method", "url"]} /></section>
            <section className="card"><h3>Response</h3><Side part={m.response} label="Response" testId="raw-response" hot={["status", "www-authenticate"]} /></section>
          </div>
        </>
      )}
    </>
  );
}
