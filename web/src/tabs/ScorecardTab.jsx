import React, { useEffect, useRef, useState } from "react";
import { scan } from "../lib/api.js";
import { CheckList, ScoreSummary } from "../lib/ui.jsx";
import { Inert } from "../lib/Inert.jsx";

// Pick a mock target (none ticked = the good server) and score it. Each defect fails exactly the checks listed beside it.
export default function ScorecardTab({ app }) {
  const { catalog, cast, vertical, card, setCard } = app;
  const [picked, setPicked] = useState([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const out = useRef(null);
  useEffect(() => { if (card && !card.empty) out.current?.scrollIntoView?.({ block: "start" }); }, [card]);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const run = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { setCard(await scan(picked, vertical)); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <h2>Score a mock MCP server</h2>
      <p className="lede" data-admin-only>{cast.server} is simulated in process. Tick defects to break it, then score it against the MCP authorization expectations. Nothing leaves this page.</p>
      <fieldset>
        <legend>Defects to inject (none = a server that does it right)</legend>
        <div className="defects">
          {catalog.defects.map((d) => (
            <label key={d.id}><input type="checkbox" checked={picked.includes(d.id)} onChange={() => toggle(d.id)} data-testid={`defect-${d.id}`} />
              <span><strong>{d.title}</strong><br /><span className="muted small">{d.fails.length ? `fails: ${d.fails.join(", ")}` : "warns only (no check fails)"}</span></span></label>
          ))}
        </div>
      </fieldset>
      <div className="actions">
        <button type="button" className="primary" onClick={run} aria-disabled={busy}>{picked.length ? `Score with ${picked.length} defect${picked.length > 1 ? "s" : ""}` : "Score the good server"}</button>
        <button type="button" onClick={() => setPicked([])} aria-disabled={!picked.length}>Clear defects</button>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      {card && !card.empty ? (
        <>
          <div ref={out} className="scroll-target"><ScoreSummary card={card} /></div>
          <div className="controls controls--spaced">
            <label htmlFor="ck-filter">Show
              <select id="ck-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All checks</option><option value="problems">Fail and warn</option><option value="fail">Fail only</option><option value="not_tested">Not tested</option><option value="pass">Pass</option>
              </select>
            </label>
          </div>
          <CheckList checks={card.checks} filter={filter} />
          {card.unverified?.length > 0 && <p className="note small">Checks resting on a source the lab could not verify (marked UNVERIFIED above): <Inert text={card.unverified.join(", ")} />.</p>}
        </>
      ) : <p className="muted" data-testid="no-card">No scorecard yet. Score a target to see per-check evidence, severity, a fix hint and the spec citation.</p>}
    </>
  );
}
