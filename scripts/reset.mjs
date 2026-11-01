#!/usr/bin/env node
// Reset a running lab: forgets the last scorecard and probe ledger (the UI Reset also puts the diagram boxes back). Loopback only; sends the same-origin header the server requires.
//   node scripts/reset.mjs [base-url]      (default http://127.0.0.1:${CONFLAB_PORT:-4901})
import { pathToFileURL } from 'node:url';
import { isLoopbackHost, DEFAULT_PORT } from '../server/src/safety.js';

export async function reset(base = `http://127.0.0.1:${process.env.CONFLAB_PORT || DEFAULT_PORT}`) {
  const u = new URL(base);
  if (!isLoopbackHost(u.hostname)) throw new Error(`refusing ${u.hostname}: loopback only`);
  const r = await fetch(new URL('/api/reset', u), { method: 'POST', headers: { 'content-type': 'application/json', origin: u.origin }, body: '{}' });
  if (!r.ok) throw new Error(`reset failed: HTTP ${r.status}`);
  return r.json();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) reset(process.argv[2]).then((j) => console.log(`reset: ${j.reset}`), (e) => { console.error(e.message); process.exit(1); });
