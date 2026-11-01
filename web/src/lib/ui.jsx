import React from "react";
import { Inert, pretty } from "./Inert.jsx";

export const STATUS_WORD = { pass: "PASS", fail: "FAIL", warn: "WARN", not_tested: "NOT TESTED", info: "INFO" };
export const StatusPill = ({ status }) => <span className="pill" data-state={status}>{STATUS_WORD[status] || status}</span>;
export const LevelPill = ({ level }) => <span className="pill" data-state={String(level).toLowerCase()}>{level}</span>;
export const VerifiedPill = ({ verified }) => <span className="pill" data-state={verified ? "verified" : "unverified"}>{verified ? "verified" : "UNVERIFIED"}</span>;

export const scoreTone = (n) => (n == null ? "hold" : n >= 90 ? "ok" : n >= 60 ? "hold" : "deny");

// One scorecard: the score, the counts in words, and the target it was run against.
export function ScoreSummary({ card }) {
  const c = card.counts || {};
  return (
    <section className="card" data-testid="score-summary" aria-label="Scorecard summary">
      <div className="score">
        <div><div className="score__n" data-state={scoreTone(card.score)} data-testid="score">{card.score == null ? "n/a" : `${card.score}%`}</div><div className="muted small">weighted: MUST 3, SHOULD 2</div></div>
        <div>
          <div className="counts">{Object.entries(c).filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className="pill" data-state={k}>{n} {STATUS_WORD[k] || k}</span>)}</div>
          <p className="small muted score__target">Target: <Inert text={card.target?.url} /> ({card.target?.kind === "probe" ? "probe" : "mock, simulated"})</p>
          {card.failedMust?.length > 0 && <p className="small score__failed" data-testid="failed-must"><strong>Failed MUST:</strong> {card.failedMust.join(", ")}</p>}
        </div>
      </div>
    </section>
  );
}

// Every check: status and level in words, then evidence, the clause, why it matters, the fix hint and the sources.
export function CheckList({ checks, filter = "all" }) {
  const shown = checks.filter((c) => filter === "all" || (filter === "problems" ? c.status === "fail" || c.status === "warn" : c.status === filter));
  if (!shown.length) return <p className="muted" data-testid="no-checks">No checks match this filter.</p>;
  return (
    <ul className="cklist" data-testid="check-list">
      {shown.map((c) => (
        <li key={c.id}>
          <details className="ck" data-state={c.status} data-testid={`check-${c.id}`} open={c.status === "fail"}>
            <summary><StatusPill status={c.status} /><LevelPill level={c.level} /><strong><Inert text={c.title} /></strong>{c.severity && <span className="small muted">severity {c.severity}</span>}</summary>
            <div className="ck__body">
              <h4>Evidence</h4>
              {c.evidence.map((e, i) => <p key={i} className="small ck__line"><Inert text={e} /></p>)}
              <h4>What the source says ({c.level})</h4><p className="small ck__line"><Inert text={c.clause} /></p>
              <h4>Why it matters</h4><p className="small ck__line"><Inert text={c.why} /></p>
              {c.fix && <><h4>Fix</h4><p className="small ck__line" data-testid="fix"><Inert text={c.fix} /></p></>}
              <h4>Sources</h4>
              <p className="small ck__line">{c.references.map((r) => <span key={r.id} className="ck__ref"><Inert text={r.label} /> <VerifiedPill verified={r.verified} /></span>)}</p>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export const Json = ({ value, testid }) => <Inert block text={pretty(value)} testid={testid} />;
