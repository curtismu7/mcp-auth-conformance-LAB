import React, { useEffect, useState } from "react";
import { getClients } from "../lib/api.js";
import { Inert } from "../lib/Inert.jsx";
import { LevelPill, VerifiedPill } from "../lib/ui.jsx";

// What real MCP clients need to connect (the D2 reference). Each group says whether its source was read; unverified groups make no claim.
export default function ClientsTab({ app }) {
  const { catalog } = app;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { getClients().then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="alert" role="alert">{error}</p>;
  if (!data) return <p className="muted" role="status">Loading the client reference...</p>;
  const ref = (id) => catalog.references.find((r) => r.id === id);
  return (
    <>
      <h2>What MCP clients need to connect</h2>
      <p className="lede" data-admin-only>Discovery, PKCE, and DCR or CIMD, as a sourced reference. As of {data.asOf}. <Inert text={data.note} /></p>
      {data.clients.map((c) => {
        const r = ref(c.source);
        return (
          <section className="card" key={c.id} data-testid={`client-${c.id}`}>
            <h3><Inert text={c.name} /> <VerifiedPill verified={c.verified} /></h3>
            <p className="small muted">Source: {r ? <>{r.url ? <a href={r.url} rel="noreferrer noopener" target="_blank">{r.label}</a> : <Inert text={r.label} />}</> : <Inert text={c.source} />}</p>
            <ul className="rules">{c.requirements.map((q) => <li key={q.id}><LevelPill level={q.level === "UNVERIFIED" ? "may" : String(q.level).toUpperCase()} /> <Inert text={q.text} /></li>)}</ul>
          </section>
        );
      })}
    </>
  );
}
