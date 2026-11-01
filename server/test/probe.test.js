import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import dns from 'node:dns';
import { validateProbeTarget, createProbeClient, nodeTransport, defaultResolve, PROBE_LIMITS } from '../src/probe.js';
import { installNetguard } from '../src/netguard.js';
import { listenInRange } from '../src/ports.js';
import { startMockServer } from '../src/mock-http.js';
import { runScan } from '../src/engine.js';

const serve = async (handler) => { const s = http.createServer(handler); const port = await listenInRange(s, '127.0.0.1', 4902, 4929); return { port, close: () => { s.close(); s.closeAllConnections?.(); } }; };

test('target validation: scheme, userinfo, external gate, literal addresses', () => {
  const v = (u, o) => validateProbeTarget(u, o);
  assert.deepEqual(v('http://127.0.0.1:4930/mcp'), { ok: true, url: 'http://127.0.0.1:4930/mcp', origin: 'http://127.0.0.1:4930', loopback: true });
  assert.equal(v('http://localhost:4930/mcp').loopback, true);
  assert.equal(v('http://[::1]:4930/mcp').ok, true);
  assert.equal(v('https://mcp.example/mcp').reason, 'external_probe_disabled');
  assert.equal(v('https://mcp.example/mcp', { allowExternal: true }).ok, true);
  assert.equal(v('http://mcp.example/mcp', { allowExternal: true }).reason, 'scheme_not_https');
  assert.equal(v('https://u:p@mcp.example/', { allowExternal: true }).reason, 'credentials_in_url');
  assert.equal(v('file:///etc/passwd').reason, 'scheme_not_allowed');
  assert.equal(v('gopher://127.0.0.1/').reason, 'scheme_not_allowed');
  assert.equal(v('not a url').reason, 'bad_url');
  assert.equal(v('').reason, 'bad_url');
  // numeric forms are normalised by the URL parser before any address check: this is the loopback the user typed
  assert.equal(v('https://2130706433/').loopback, true);
  assert.equal(v('http://0x7f.1/').loopback, true);
  assert.equal(v('https://0xa000001/', { allowExternal: true }).reason, 'address_blocked:private-10');
});

test('a fake transport proves the guard: private DNS answers, DNS to loopback, mixed answers, and pinning', async () => {
  const calls = [];
  const transport = async (o) => { calls.push(o); return { status: 200, headers: {}, body: '{}' }; };
  const mk = (answers) => createProbeClient({ url: 'https://mcp.example/mcp', allowExternal: true, resolve: async () => answers, transport });
  assert.equal((await mk(['10.0.0.9']).request({ url: 'https://mcp.example/a' })).blocked, 'ssrf:private-10');
  assert.equal((await mk(['127.0.0.1']).request({ url: 'https://mcp.example/a' })).blocked, 'ssrf:dns_to_loopback');
  assert.equal((await mk(['1.1.1.1', '169.254.169.254']).request({ url: 'https://mcp.example/a' })).blocked, 'ssrf:link-local-or-metadata');
  assert.equal(calls.length, 0, 'no transport call for a refused address');
  const ok = await mk(['1.1.1.1', '8.8.8.8']).request({ url: 'https://mcp.example/a' });
  assert.equal(ok.status, 200);
  assert.deepEqual([calls[0].address, calls[0].host, calls[0].port, calls[0].tls], ['1.1.1.1', 'mcp.example', 443, true]);
});

test('requests to another origin, other methods, oversized bodies and credentials never reach the transport', async () => {
  const calls = [];
  const transport = async (o) => { calls.push(o); return { status: 200, headers: {}, body: '{}' }; };
  const c = createProbeClient({ url: 'https://mcp.example/mcp', allowExternal: true, resolve: async () => ['1.1.1.1'], transport });
  assert.equal((await c.request({ url: 'https://other.example/x' })).blocked, 'cross_origin');
  assert.equal((await c.request({ url: 'http://mcp.example/x' })).blocked, 'cross_origin');
  assert.equal((await c.request({ url: 'https://mcp.example:8443/x' })).blocked, 'cross_origin');
  for (const m of ['DELETE', 'PUT', 'PATCH', 'OPTIONS', 'CONNECT']) assert.equal((await c.request({ method: m, url: 'https://mcp.example/x' })).blocked, 'method_not_allowed');
  assert.equal((await c.request({ method: 'POST', url: 'https://mcp.example/x', body: 'x'.repeat(PROBE_LIMITS.maxRequestBytes + 1) })).blocked, 'request_too_large');
  assert.equal(calls.length, 0);
  await c.request({ method: 'POST', url: 'https://mcp.example/x', body: '{}', headers: { Authorization: 'Bearer secret', Cookie: 'a=b', 'X-Custom': 'y', traceparent: '00-a-b-01', 'content-type': 'application/json', accept: 'x\r\nInjected: 1' } });
  assert.deepEqual(Object.keys(calls[0].headers).sort(), ['accept', 'content-type', 'traceparent', 'user-agent']);
  assert.ok(!/[\r\n]/.test(calls[0].headers.accept));
});

test('real loopback: the probe scans a local mock over HTTP, sends no credentials, and reports token-needing checks as not tested', async () => {
  const g = installNetguard();
  const srv = await startMockServer({ defects: ['no_iss'] });
  try {
    const client = createProbeClient({ url: srv.mock.resource });
    const card = await runScan({ client });
    assert.equal(card.target.kind, 'probe');
    assert.deepEqual(card.checks.filter((c) => c.status === 'fail').map((c) => c.id), ['iss']);
    for (const id of ['dcr_abuse_protection', 'resource_param', 'audience_validation', 'insufficient_scope_403']) assert.equal(card.checks.find((c) => c.id === id).status, 'not_tested', id);
    assert.ok(client.requests.every((r) => /^(GET|POST) http:\/\/127\.0\.0\.1:\d+\//.test(r)), JSON.stringify(client.requests));
    assert.ok(client.requests.every((r) => !/\/(register|token|authorize|_lab)/.test(r)), 'the probe never registers, authorizes, or calls a lab fixture');
    assert.deepEqual(g.attempts, []);
  } finally { await srv.close(); g.uninstall(); }
});

test('nodeTransport enforces the size cap and the timeout against a real loopback server', async () => {
  const big = await serve((req, res) => { res.writeHead(200); res.end('x'.repeat(5000)); });
  const slow = await serve(() => { /* never answers */ });
  try {
    const base = { address: '127.0.0.1', family: 4, host: '127.0.0.1', tls: false, path: '/', method: 'GET', headers: {} };
    const r1 = await nodeTransport({ ...base, port: big.port, timeoutMs: 2000, maxBytes: 1000 });
    assert.equal(r1.truncated, true); assert.ok(r1.body.length <= 1000);
    const t = Date.now();
    const r2 = await nodeTransport({ ...base, port: slow.port, timeoutMs: 150, maxBytes: 1000 });
    assert.equal(r2.error, 'timeout'); assert.ok(Date.now() - t < 1500);
  } finally { big.close(); slow.close(); }
  assert.equal(PROBE_LIMITS.timeoutMs, 10000); assert.equal(PROBE_LIMITS.maxBytes, 262144); assert.equal(PROBE_LIMITS.maxRedirects, 3);
});

test('redirect chains: a loop stops at the cap, a cross-origin hop is refused after a same-origin hop', async () => {
  const other = await serve((q, r) => { r.writeHead(200); r.end('other'); });
  const a = await serve((req, res) => {
    if (req.url === '/loop') { res.writeHead(302, { location: '/loop' }); return res.end(); }
    if (req.url === '/hop') { res.writeHead(302, { location: '/leave' }); return res.end(); }
    res.writeHead(302, { location: `http://127.0.0.1:${other.port}/` }); res.end();
  });
  try {
    const c = createProbeClient({ url: `http://127.0.0.1:${a.port}/mcp` });
    assert.equal((await c.request({ url: `http://127.0.0.1:${a.port}/loop` })).blocked, 'too_many_redirects');
    const r = await c.request({ url: `http://127.0.0.1:${a.port}/hop` });
    assert.equal(r.blocked, 'cross_origin_redirect'); assert.equal(r.hops.length, 2);
    assert.ok(!c.requests.some((x) => x.includes(String(other.port))), 'the other origin was never contacted');
  } finally { a.close(); other.close(); }
});

test('the 10 s limit is a hard wall-clock deadline: a server that trickles a byte every 100 ms cannot extend it', async () => {
  const s = await serve((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); const t = setInterval(() => res.write('x'), 100); res.on('close', () => clearInterval(t)); });
  try {
    const t0 = Date.now();
    const r = await nodeTransport({ address: '127.0.0.1', family: 4, host: '127.0.0.1', port: s.port, tls: false, path: '/', method: 'GET', headers: {}, timeoutMs: 600, maxBytes: 1 << 20 });
    const took = Date.now() - t0;
    assert.equal(r.error, 'timeout');
    assert.ok(took >= 550 && took < 1500, `took ${took} ms`);
  } finally { s.close(); }
});

test('the probe client gives redirects and the first hop one shared budget', async () => {
  const seen = [];
  const transport = async (o) => { seen.push(o.timeoutMs); return seen.length < 3 ? { status: 302, headers: { location: '/next' }, body: '' } : { status: 200, headers: {}, body: '{}' }; };
  const c = createProbeClient({ url: 'https://mcp.example/mcp', allowExternal: true, resolve: async () => ['1.1.1.1'], transport });
  await c.request({ url: 'https://mcp.example/mcp' });
  assert.equal(seen.length, 3);
  assert.ok(seen.every((t) => t <= PROBE_LIMITS.timeoutMs && t >= 1));
  assert.ok(seen[2] <= seen[0]);
});

test('with the netguard installed, the default resolver may look up only the typed host; other lookups stay refused', async () => {
  const g = installNetguard();
  const before = g.attempts.length;
  try {
    await assert.rejects(defaultResolve('lab-target.invalid'), (e) => !/netguard/.test(String(e.message)));
    assert.equal(g.attempts.length, before, 'the typed host lookup was not refused by the netguard');
    await assert.rejects(dns.promises.lookup('someone-else.invalid'), /netguard: blocked lookup/);
    assert.equal(g.attempts.length, before + 1);
  } finally { g.uninstall(); }
});
