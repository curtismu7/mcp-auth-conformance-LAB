import React, { useState } from "react";
import { probe } from "../lib/api.js";
import { Inert } from "../lib/Inert.jsx";
import { CheckList, Json, ScoreSummary } from "../lib/ui.jsx";

// The Live side of the lab: a read-only probe of ONE typed URL. It only runs in Live mode (header toggle). Gated: the viewer must tick the
// confirmation, and the server re-checks the exact acknowledgement. By default only loopback targets are accepted; the lab never reaches
// the open internet unless its operator turned that on.
export default function ProbeTab({ app }) {
  const { catalog, card, setCard, mode, setMode } = app;
  const live = mode === "live";
  const p = catalog.probe;
  const [url, setUrl] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState(null);
  const [log, setLog] = useState(null);
  const ready = live && ok && !!url.trim() && !busy;
  const send = async () => {
    if (!ready) return;
    setBusy(true); setRefusal(null); setLog(null);
    try {
      const { status, data } = await probe(url.trim(), p.ack);
      if (status === 200) { setCard(data); setLog(data.requestLog || []); }
      else setRefusal({ status, message: data.message || `HTTP ${status}`, reason: data.reason });
    } catch (e) { setRefusal({ status: 0, message: e.message }); } finally { setBusy(false); }
  };
  const showCard = card && card.target?.kind === "probe" ? card : null;
  return (
    <>
      <h2>Probe one URL (read only)</h2>
      {!live && (
        <p className="note" id="probe-mock-note" role="status" data-testid="probe-mock-note">
          The probe is the Live side of this lab, and the header is on Mock, so nothing can be sent. Switch to Real to use it.{" "}
          <button type="button" onClick={() => setMode("live")}>Switch to Real</button>
        </p>
      )}
      <p className="note" data-testid="probe-mode-note">{p.externalEnabled ? "External probing is ON for this run: the lab will contact the one https URL you type." : "External probing is OFF: only loopback targets (127.0.0.1, localhost, [::1]) are accepted. The lab never contacts the open internet."}</p>
      <section className="card">
        <h3>What the probe does</h3>
        <ul className="rules" data-testid="probe-rules">{p.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="small muted">Limits: {p.limits.timeoutMs / 1000}s timeout, {Math.round(p.limits.maxBytes / 1024)} KB per response.</p>
        <div className="field"><label htmlFor="probe-url">Target MCP endpoint URL</label>
          <input id="probe-url" type="text" inputMode="url" autoComplete="off" spellCheck="false" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:4930/mcp" maxLength={2048} /></div>
        <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="probe-confirm" /> <span>{p.ack}</span></label>
        <div className="actions"><button type="button" className="primary" onClick={send} aria-disabled={!ready} aria-describedby={live ? undefined : "probe-mock-note"}>Probe this URL</button></div>
      </section>
      {refusal && <p className="alert" role="alert" data-testid="probe-refusal"><strong>{refusal.status ? `Refused (${refusal.status})` : "Failed"}:</strong> <Inert text={refusal.message} />{refusal.reason && <> Reason: <code><Inert text={refusal.reason} /></code></>}</p>}
      {showCard && (
        <>
          <ScoreSummary card={showCard} />
          <p className="small muted">Checks that need a token or would register a client are not run against a probe target; they show as NOT TESTED.</p>
          <CheckList checks={showCard.checks} filter="all" />
          {log && <section className="card"><h3>Every request the probe sent ({log.length})</h3><Json value={log} testid="probe-log" /></section>}
        </>
      )}
    </>
  );
}
