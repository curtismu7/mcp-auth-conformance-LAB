import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startAppInRange } from './helpers.js';
import { installNetguard } from '../src/netguard.js';
import { startMockServer } from '../src/mock-http.js';
import { PROBE_ACK } from '../src/app.js';
import { loadDiagram } from '../src/diagramData.js';
import { SCENARIOS } from '../src/stories.js';

let app; let guard;
before(async () => { guard = installNetguard(); app = await startAppInRange(); });
after(() => { app.stop(); guard.uninstall(); });

test('GET /api/health is demo-health/1 and small', async () => {
  const r = await app.get('/api/health');
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  const t = await r.text(); assert.ok(t.length < 4096);
  const j = JSON.parse(t);
  assert.deepEqual(Object.keys(j).sort(), ['at', 'demo', 'runtime', 'schema', 'state']);
  assert.equal(j.schema, 'demo-health/1'); assert.equal(j.state, 'ready'); assert.equal(j.runtime, 'offline');
  assert.deepEqual(Object.keys(j.demo).sort(), ['id', 'name', 'version']);
  assert.ok(j.demo.name.length <= 80 && j.demo.version.length <= 32 && j.demo.id.length <= 64);
  assert.ok(!Number.isNaN(Date.parse(j.at)));
});

test('catalog carries the banner, the rules with MUST/SHOULD, references with verified flags, and the probe rules', async () => {
  const j = await (await app.get('/api/catalog')).json();
  assert.match(j.banner.mock, /^Simulated \(Mock mode\)\. Targets are/);
  assert.match(j.banner.live, /^Live mode\. Only the Probe tab goes live/);
  assert.match(j.banner.live, /still use simulated in-process mock servers/);
  assert.deepEqual(j.diagrams, ['mcp-authorization-flow']);
  assert.ok(j.checks.length >= 15 && j.checks.every((c) => ['MUST', 'SHOULD', 'MAY'].includes(c.level)));
  assert.ok(j.defects.length >= 10);
  assert.ok(j.references.every((r) => typeof r.verified === 'boolean'));
  assert.equal(j.probe.externalEnabled, false); assert.equal(j.probe.ack, PROBE_ACK);
  assert.equal((await app.get('/api/catalog')).headers.get('content-security-policy').includes("default-src 'self'"), true);
});

test('GET /api/diagrams/:name serves diagram-studio/1 data by name; an unknown name is a JSON 404 that does not echo it', async () => {
  const j = await (await app.get('/api/diagrams/mcp-authorization-flow')).json();
  assert.deepEqual(j, loadDiagram('mcp-authorization-flow'));
  assert.equal(j.schema, 'diagram-studio/1');
  for (const bad of ['nope', '__proto__', 'constructor', '..%2Fpackage']) {
    const r = await app.get(`/api/diagrams/${bad}`);
    assert.equal(r.status, 404, bad);
    assert.deepEqual(await r.json(), { error: 'not_found' });
  }
});

test('clients reference: spec and ChatGPT are verified with sources; Claude and others are UNVERIFIED and claim nothing', async () => {
  const j = await (await app.get('/api/clients')).json();
  const c = Object.fromEntries(j.clients.map((x) => [x.id, x]));
  assert.equal(c.spec.verified, true); assert.equal(c.chatgpt.verified, true);
  assert.equal(c.claude.verified, false); assert.equal(c.others.verified, false);
  assert.ok(c.claude.requirements.every((r) => r.level === 'UNVERIFIED'));
  assert.ok(j.clients.every((x) => x.sourceRef && typeof x.sourceRef.verified === 'boolean'));
  assert.equal(c.chatgpt.sourceRef.url, 'https://developers.openai.com/apps-sdk/build/auth');
});

test('POST /api/scan: good server 100, a defect fails its check; bad input is rejected with 400', async () => {
  const good = await (await app.post('/api/scan', { defects: [] })).json();
  assert.equal(good.score, 100); assert.equal(good.schema, 'conformance-scorecard/1');
  const bad = await (await app.post('/api/scan', { defects: ['no_iss'], vertical: 'travel' })).json();
  assert.deepEqual(bad.checks.filter((c) => c.status === 'fail').map((c) => c.id), ['iss']);
  for (const m of bad.trace.messages) assert.match(m.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  for (const body of [{ defects: 'x' }, { defects: ['nope'] }, { defects: [1] }, { vertical: 'zzz' }, { defects: Array(40).fill('no_iss') }]) assert.equal((await app.post('/api/scan', body)).status, 400, JSON.stringify(body));
  assert.equal((await app.post('/api/scan', '{not json')).status, 400);
  assert.equal((await app.post('/api/scan', { defects: [], pad: 'x'.repeat(9000) })).status, 413);
});

test('every scenario passes through the API in every vertical', async () => {
  for (const v of ['banking', 'travel', 'retail']) for (const s of SCENARIOS) {
    const j = await (await app.post('/api/scenario', { id: s.id, vertical: v })).json();
    assert.equal(j.pass, true, `${s.id}/${v}: ${j.problems}`);
  }
  assert.equal((await app.post('/api/scenario', { id: 'S99' })).status, 400);
  assert.equal((await app.get('/api/scenarios/S01?vertical=retail').then((r) => r.json())).title.includes('Fieldstone'), true);
});

test('writes: wrong Origin, no Origin, wrong content type and cross-site are refused; a foreign Host is refused', async () => {
  const send = (headers, body = '{}') => new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: app.port, path: '/api/scan', method: 'POST', headers: { 'content-length': Buffer.byteLength(body), ...headers } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.end(body);
  });
  const host = `127.0.0.1:${app.port}`;
  assert.equal(await send({ host, 'content-type': 'application/json', origin: 'http://evil.example' }), 403);
  assert.equal(await send({ host, 'content-type': 'application/json' }), 403);
  assert.equal(await send({ host, 'content-type': 'text/plain', origin: `http://${host}` }), 415);
  assert.equal(await send({ host, 'content-type': 'application/json', origin: `http://${host}`, 'sec-fetch-site': 'cross-site' }), 403);
  assert.equal(await send({ host: 'evil.example', 'content-type': 'application/json', origin: 'http://evil.example' }), 403);
  assert.equal(await send({ host, 'content-type': 'application/json', origin: `http://${host}` }), 200);
});

test('probe gate: no confirmation, wrong acknowledgement, external and private targets are refused before any request', async () => {
  const url = 'http://127.0.0.1:4999/mcp';
  const before = guard.attempts.length;
  assert.equal((await app.post('/api/probe', { url })).status, 412);
  assert.equal((await app.post('/api/probe', { url, confirm: true })).status, 412);
  assert.equal((await app.post('/api/probe', { url, confirm: true, ack: 'yes' })).status, 412);
  assert.equal((await app.post('/api/probe', { url, confirm: 'true', ack: PROBE_ACK })).status, 412);
  assert.equal((await app.post('/api/probe', { url: 5, confirm: true, ack: PROBE_ACK })).status, 400);
  for (const [u, reason] of [['https://mcp.example/mcp', 'external_probe_disabled'], ['http://10.0.0.5/', 'scheme_not_https'], ['https://169.254.169.254/', 'external_probe_disabled'], ['https://u:p@x.example/', 'credentials_in_url'], ['file:///etc/passwd', 'scheme_not_allowed']]) {
    const r = await app.post('/api/probe', { url: u, confirm: true, ack: PROBE_ACK });
    assert.equal(r.status, 422, u); assert.equal((await r.json()).reason, reason, u);
  }
  assert.equal(guard.attempts.length, before, 'nothing tried to leave loopback');
});

test('probe end to end against a local mock, then reset', async () => {
  const srv = await startMockServer({ defects: ['cimd_unsupported'] });
  try {
    const r = await app.post('/api/probe', { url: srv.mock.resource, confirm: true, ack: PROBE_ACK });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.target.kind, 'probe');
    assert.deepEqual(j.checks.filter((c) => c.status === 'fail').map((c) => c.id), ['registration_cimd']);
    assert.ok(j.requestLog.every((x) => x.includes(`127.0.0.1:${srv.port}`)));
    assert.equal((await (await app.get('/api/last')).json()).target.kind, 'probe');
    assert.equal((await (await app.post('/api/reset', {})).json()).reset, 'ok');
    assert.equal((await (await app.get('/api/last')).json()).empty, true);
  } finally { await srv.close(); }
});

test('unknown API paths 404 as JSON', async () => { const r = await app.get('/api/nope'); assert.equal(r.status, 404); assert.equal((await r.json()).error, 'not_found'); });

test('a probe URL over 2048 characters is refused as bad input before the gate', async () => {
  const long = `https://x.example/${'a'.repeat(2100)}`;
  assert.equal((await app.post('/api/probe', { url: long, confirm: true, ack: PROBE_ACK })).status, 400);
});

test('a second probe while one is running gets 429 probe_busy', async () => {
  const slow = http.createServer((_q, s) => setTimeout(() => { s.writeHead(200, { 'content-type': 'text/plain' }); s.end('ok'); }, 300));
  await new Promise((r) => slow.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${slow.address().port}/mcp`;
  try {
    const first = app.post('/api/probe', { url, confirm: true, ack: PROBE_ACK });
    await new Promise((r) => setTimeout(r, 50));
    const second = await app.post('/api/probe', { url, confirm: true, ack: PROBE_ACK });
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error, 'probe_busy');
    await first;
  } finally { slow.close(); }
});

test('external probing is on only when CONFLAB_PROBE_EXTERNAL is exactly "1" (a "0" or "false" in the shared file does not enable it)', async () => {
  for (const [value, expected] of [['1', true], ['0', false], ['false', false], ['', false], [undefined, false]]) {
    const a = await startAppInRange(value === undefined ? {} : { CONFLAB_PROBE_EXTERNAL: value });
    try { assert.equal((await (await a.get('/api/catalog')).json()).probe.externalEnabled, expected, String(value)); } finally { a.stop(); }
  }
});
