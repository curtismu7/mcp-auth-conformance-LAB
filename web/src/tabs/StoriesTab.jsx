import React, { useState } from "react";
import { runScenario } from "../lib/api.js";
import { fill } from "../lib/fill.js";
import { Inert } from "../lib/Inert.jsx";
import { CheckList, Json, ScoreSummary } from "../lib/ui.jsx";

const KIND = { scan: "Scan", compare: "Compare", stepup: "Step-up", "probe-local": "Probe", "probe-refusals": "Probe guards", "probe-redirect": "Probe guards" };

// Stories as data: the server owns the steps; {{tokens}} are filled from the chosen vertical. Running a story reports whether the lab
// behaved the way the story says it should.
export function ScenarioResult({ run }) {
  const r = run.result;
  return (
    <div data-testid="scenario-result">
      <p className={run.pass ? "note" : "alert"} data-state={run.pass ? "ok" : "bad"} role="status" data-testid="scenario-verdict"><strong>{run.pass ? "Behaved as the story says." : "Did not match the story:"}</strong> {run.problems.map((p, i) => <Inert key={i} text={p} />)}</p>
      {r.schema === "conformance-scorecard/1" && <><ScoreSummary card={r} /><CheckList checks={r.checks} filter="problems" /></>}
      {r.rows && (
        <table className="keytable" data-testid="compare-table"><thead><tr><th>Server</th><th>CIMD</th><th>DCR</th><th>Score</th></tr></thead>
          <tbody>{r.rows.map((x) => <tr key={x.label}><td data-label="Server">{x.label}</td><td>{x.cimd}</td><td>{x.dcr}</td><td>{x.score}%</td></tr>)}</tbody></table>
      )}
      {r.outcome && <dl className="kv"><dt>Outcome</dt><dd data-testid="stepup-outcome">{r.outcome}</dd><dt>HTTP statuses</dt><dd>{r.statuses.join(" then ")}</dd><dt>Scope asked first</dt><dd><Inert text={r.challenged.first} /></dd><dt>Scope asked second</dt><dd><Inert text={r.challenged.second || "none"} /></dd></dl>}
      {r.cases && (
        <table className="keytable" data-testid="refusal-table"><thead><tr><th>Target typed</th><th>Refused because</th><th>Matches</th></tr></thead>
          <tbody>{r.cases.map((x, i) => <tr key={i}><td><Inert text={x.input} /></td><td><Inert text={x.got} /></td><td>{x.ok ? "yes" : "NO"}</td></tr>)}</tbody></table>
      )}
      {"crossOriginBlocked" in r && <dl className="kv"><dt>Same-origin redirect</dt><dd>followed, final status {r.sameOriginFinalStatus}</dd><dt>Cross-origin redirect</dt><dd data-testid="redirect-blocked"><Inert text={r.crossOriginBlocked} /></dd></dl>}
      {!r.schema && !r.rows && !r.outcome && !r.cases && !("crossOriginBlocked" in r) && <Json value={r} />}
    </div>
  );
}

export default function StoriesTab({ app }) {
  const { catalog, cast, vertical, scenarioId, setScenarioId, scenarioRun, setScenarioRun, setCard, cursor, setCursor, go } = app;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sc = catalog.scenarios.find((s) => s.id === scenarioId) || catalog.scenarios[0];
  const total = sc.steps.length;
  const run = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const out = await runScenario(sc.id, vertical);
      setScenarioRun(out);
      if (out.result?.schema === "conformance-scorecard/1" || out.result?.trace) setCard(out.result);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const move = (d) => setCursor(Math.max(0, Math.min(total - 1, (cursor < 0 ? -1 : cursor) + d)));
  return (
    <>
      <h2>Stories</h2>
      <p className="lede" data-admin-only>Each story is data. Pick one, read it step by step, then run it to see the lab behave that way. The persona in the header changes the cast.</p>
      <div className="card controls">
        <label htmlFor="scenario">Story
          <select id="scenario" value={sc.id} onChange={(e) => { setScenarioId(e.target.value); setScenarioRun(null); setCursor(-1); }}>
            {catalog.scenarios.map((s) => <option key={s.id} value={s.id}>{s.id} [{KIND[s.kind] || s.kind}] {fill(s.title, cast)}</option>)}
          </select>
        </label>
        <button type="button" className="primary" onClick={run} aria-disabled={busy}>Run this story</button>
        <button type="button" onClick={() => go("diagram")}>Open in diagram</button>
      </div>
      <article className="story" data-testid="story">
        <p className="story__eyebrow">{sc.id} / {KIND[sc.kind] || sc.kind}</p>
        <h3 className="story__title"><Inert text={fill(sc.title, cast)} /></h3>
        <div className="story__controls" role="group" aria-label="Story steps">
          <button type="button" onClick={() => move(-1)} aria-disabled={cursor <= 0}>Previous step</button>
          <button type="button" onClick={() => move(1)} aria-disabled={cursor >= total - 1}>Next step</button>
          <span className="muted small" aria-live="polite" data-testid="step-count">{cursor < 0 ? `${total} steps` : `Step ${cursor + 1} of ${total}`}</span>
        </div>
        <ol className="story__steps story__steps--plain">
          {sc.steps.map((s, i) => <li key={i} aria-current={i === cursor ? "step" : undefined}><Inert text={fill(s, cast)} /></li>)}
        </ol>
        <p className="story__takeaway"><Inert text={fill(sc.takeaway, cast)} /></p>
      </article>
      {error && <p className="alert" role="alert">{error}</p>}
      {scenarioRun && scenarioRun.id === sc.id && <ScenarioResult run={scenarioRun} />}
    </>
  );
}
