// Runs a scenario and compares the outcome with what the scenario data says should happen.
// -> { id, kind, pass, problems: [], result }. Never throws for an unexpected outcome: it reports the mismatch.
import http from 'node:http';
import { runScan } from './engine.js';
import { createMock, getVertical } from './mock.js';
import { createMockClient } from './mock-client.js';
import { startMockServer } from './mock-http.js';
import { createProbeClient, validateProbeTarget } from './probe.js';
import { authorizeAndExchange } from './flow.js';
import { parseChallenges, param } from './wwwauth.js';
import { createTrace } from './trace.js';
import { listenInRange } from './ports.js';
import { SCENARIOS, getScenario, renderScenario } from './stories.js';

const idsWith = (card, status) => card.checks.filter((c) => c.status === status).map((c) => c.id).sort();
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const parse = (b) => { try { return JSON.parse(b); } catch { return null; } };

export async function scanMock(defects, vertical = 'banking', clock) {
  const mock = createMock({ defects, vertical });
  return runScan({ client: createMockClient(mock), clock, label: defects.join('+') || 'good' });
}

async function stepUp(defects, vertical, clock) {
  const mock = createMock({ defects, vertical }); const client = createMockClient(mock); const { cast } = mock;
  const trace = createTrace({ clock }); const statuses = [];
  const call = async (label, req) => { const traceparent = trace.nextTraceparent(); const r = await client.request({ ...req, headers: { traceparent, ...(req.headers || {}) } }); trace.add({ label, traceparent, request: req, response: r }); return r; };
  const rpc = (name) => JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } });
  const mcp = (label, token, name) => call(label, { method: 'POST', url: mock.resource, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: rpc(name) });
  const asDoc = parse((await call('Authorization server metadata', { method: 'GET', url: `${mock.origin}/.well-known/oauth-authorization-server` })).body);
  const r1 = await mcp('No token', null, cast.readTool); statuses.push(r1.status);
  const scope1 = param(parseChallenges(r1.headers['www-authenticate'] || '').challenges[0], 'scope');
  const t1 = (await authorizeAndExchange(call, asDoc, { resource: mock.resource, scope: scope1, label: 'Authorize (read)' })).token?.access_token;
  const r2 = await mcp('Write tool with a read token', t1, cast.writeTool); statuses.push(r2.status);
  const scope2 = param(parseChallenges(r2.headers['www-authenticate'] || '').challenges[0], 'scope');
  let outcome = 'stuck';
  if (r2.status === 403 && scope2) {
    const t2 = (await authorizeAndExchange(call, asDoc, { resource: mock.resource, scope: scope2, label: 'Step-up authorize' })).token?.access_token;
    const r3 = await mcp('Write tool after step-up', t2, cast.writeTool); statuses.push(r3.status);
    if (r3.status === 200) outcome = 'stepped_up';
  }
  return { outcome, statuses, challenged: { first: scope1 || null, second: scope2 || null }, trace: trace.envelope() };
}

async function probeLocal(defects, vertical, clock) {
  const srv = await startMockServer({ defects, vertical });
  try {
    const client = createProbeClient({ url: srv.mock.resource });
    return await runScan({ client, clock, label: `probe ${defects.join('+') || 'good'}` });
  } finally { await srv.close(); }
}

export function probeRefusals(cases) {
  const out = [];
  return Promise.all(cases.map(async (c) => {
    let reason;
    const resolve = async () => c.resolves || [];
    try {
      const v = validateProbeTarget(c.input, { allowExternal: !!c.external });
      if (!v.ok) reason = v.reason;
      else {
        const client = createProbeClient({ url: c.input, allowExternal: !!c.external, resolve, transport: async () => { throw new Error('transport must not be reached'); } });
        const r = await client.request({ method: 'GET', url: c.input });
        reason = r.blocked;
      }
    } catch (e) { reason = e.reason || e.message; }
    out.push({ input: c.input, expected: c.reason, got: reason, ok: reason === c.reason });
    return null;
  })).then(() => out);
}

async function probeRedirect() {
  const mk = (handler) => { const s = http.createServer(handler); return listenInRange(s, '127.0.0.1', 4902, 4929).then((port) => ({ s, port })); };
  const b = await mk((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('other origin'); });
  const a = await mk((req, res) => {
    if (req.url === '/r1') { res.writeHead(302, { location: '/r2' }); return res.end(); }
    if (req.url === '/r2') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('same origin'); }
    res.writeHead(302, { location: `http://127.0.0.1:${b.port}/x` }); res.end();
  });
  try {
    const client = createProbeClient({ url: `http://127.0.0.1:${a.port}/mcp` });
    const ok = await client.request({ method: 'GET', url: `http://127.0.0.1:${a.port}/r1` });
    const bad = await client.request({ method: 'GET', url: `http://127.0.0.1:${a.port}/mcp` });
    return { sameOriginFinalStatus: ok.status, crossOriginBlocked: bad.blocked };
  } finally { for (const x of [a, b]) { x.s.close(); x.s.closeAllConnections?.(); } }
}

export async function runScenario(idOrSlug, verticalId = 'banking', { clock } = {}) {
  const raw = getScenario(idOrSlug);
  if (!raw) throw new Error(`unknown scenario ${idOrSlug}`);
  const vertical = getVertical(verticalId); if (!vertical) throw new Error(`unknown vertical ${verticalId}`);
  const scenario = renderScenario(raw, vertical);
  const problems = []; let result;
  const expect = scenario.expect;
  switch (scenario.kind) {
    case 'scan': case 'probe-local': {
      result = scenario.kind === 'scan' ? await scanMock(scenario.target.defects, verticalId, clock) : await probeLocal(scenario.target.defects, verticalId, clock);
      if (!same(idsWith(result, 'fail'), expect.fail)) problems.push(`fail: expected [${expect.fail}] got [${idsWith(result, 'fail')}]`);
      if (expect.warn && !same(idsWith(result, 'warn'), expect.warn)) problems.push(`warn: expected [${expect.warn}] got [${idsWith(result, 'warn')}]`);
      if (expect.score !== undefined && result.score !== expect.score) problems.push(`score: expected ${expect.score} got ${result.score}`);
      if (expect.notTested) for (const id of expect.notTested) if (result.checks.find((c) => c.id === id).status !== 'not_tested') problems.push(`${id} should be not_tested`);
      break;
    }
    case 'compare': {
      const rows = [];
      for (const t of scenario.targets) { const card = await scanMock(t.defects, verticalId, clock); const st = (id) => card.checks.find((c) => c.id === id).status; rows.push({ label: t.label, cimd: st('registration_cimd'), dcr: st('registration_dcr'), score: card.score }); }
      result = { rows };
      for (const e of expect.rows) { const r = rows.find((x) => x.label === e.label); if (!r || r.cimd !== e.cimd || r.dcr !== e.dcr) problems.push(`${e.label}: expected cimd ${e.cimd}/dcr ${e.dcr}, got ${r?.cimd}/${r?.dcr}`); }
      break;
    }
    case 'stepup': {
      result = await stepUp(scenario.target.defects, verticalId, clock);
      if (result.outcome !== expect.outcome) problems.push(`outcome: expected ${expect.outcome} got ${result.outcome}`);
      if (JSON.stringify(result.statuses) !== JSON.stringify(expect.statuses)) problems.push(`statuses: expected ${expect.statuses} got ${result.statuses}`);
      break;
    }
    case 'probe-refusals': {
      result = { cases: await probeRefusals(expect.cases) };
      for (const c of result.cases) if (!c.ok) problems.push(`${c.input}: expected ${c.expected} got ${c.got}`);
      break;
    }
    case 'probe-redirect': {
      result = await probeRedirect();
      for (const k of Object.keys(expect)) if (result[k] !== expect[k]) problems.push(`${k}: expected ${expect[k]} got ${result[k]}`);
      break;
    }
    default: throw new Error(`unknown scenario kind ${scenario.kind}`);
  }
  return { id: scenario.id, slug: scenario.slug, kind: scenario.kind, vertical: verticalId, title: scenario.title, pass: problems.length === 0, problems, result };
}

export const runAllScenarios = async (verticalId = 'banking') => { const out = []; for (const s of SCENARIOS) out.push(await runScenario(s.id, verticalId)); return out; };
