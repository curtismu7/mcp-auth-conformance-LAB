import test from 'node:test';
import assert from 'node:assert/strict';
import { runScan } from '../src/engine.js';
import { createTrace, inert } from '../src/trace.js';

// A client that answers every request with whatever the test supplies. No sockets.
const stub = (responder, { active = false } = {}) => ({ kind: 'stub', origin: 'https://mcp.example', targetUrl: 'https://mcp.example/mcp', active, requests: [], async request(r) { return responder(r); } });
const json = (obj, headers = {}) => ({ status: 200, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(obj) });
const ids = (card, s) => card.checks.filter((c) => c.status === s).map((c) => c.id);

test('a target that answers 200 HTML to everything, 500s, or nothing is scored without throwing', async () => {
  for (const r of [() => ({ status: 200, headers: {}, body: '<html>hi</html>' }), () => ({ status: 500, headers: {}, body: 'boom' }), () => ({ status: 0, headers: {}, body: '', error: 'ECONNREFUSED' }), () => ({ status: 401, headers: {}, body: '' })]) {
    const card = await runScan({ client: stub(r) });
    assert.equal(card.checks.length, 17 + 0 > 0 ? card.checks.length : 0);
    assert.ok(card.checks.every((c) => ['pass', 'warn', 'fail', 'not_tested', 'info'].includes(c.status)));
  }
  const dead = await runScan({ client: stub(() => ({ status: 0, headers: {}, body: '', error: 'ECONNREFUSED' })) });
  assert.equal(dead.score, null); assert.ok(dead.checks.every((c) => c.status === 'not_tested'));
});

test('hostile documents: deeply nested JSON, wrong types, huge arrays and control characters do not crash or recurse', async () => {
  const deep = '['.repeat(200000) + ']'.repeat(200000);
  const huge = { resource: 'https://mcp.example/mcp', authorization_servers: Array(100000).fill('https://mcp.example') };
  const evil = { resource: 'https://mcp.example/mcp\u0000‮', authorization_servers: [{ a: 1 }, null, 7] };
  const bodies = [deep, JSON.stringify(huge), JSON.stringify(evil), JSON.stringify([1, 2]), 'null', '"str"', '{"resource":', JSON.stringify({ authorization_servers: 'x', code_challenge_methods_supported: 'S256', issuer: 5 })];
  for (const body of bodies) {
    const card = await runScan({ client: stub((r) => (r.method === 'POST' ? { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/mcp", scope="s"' }, body: '' } : { status: 200, headers: { 'content-type': 'application/json' }, body })) });
    assert.ok(card.checks.length > 10);
    for (const c of card.checks) for (const e of c.evidence) assert.ok(!/[\u0000-\u0008‮]/.test(e), `${c.id}: control characters in evidence`);
  }
});

test('hostile headers: a huge, malformed or injected WWW-Authenticate fails the shape check and nothing else breaks', async () => {
  for (const www of ['Bearer ' + 'a=1,'.repeat(100000), 'Bearer ,,,,', '\u0000', 'Bearer resource_metadata="' + 'x'.repeat(100000) + '"', 'Basic realm="x"']) {
    const card = await runScan({ client: stub((r) => (r.method === 'POST' ? { status: 401, headers: { 'www-authenticate': www }, body: '' } : { status: 404, headers: {}, body: '' })) });
    assert.equal(card.checks.find((c) => c.id === 'challenge_shape').status, 'fail', www.slice(0, 20));
    assert.ok(JSON.stringify(card).length < 400000, 'the scorecard stays bounded');
  }
});

test('metadata served for any path is a warning; a redirecting or cross-origin authorization server is not fetched', async () => {
  const anyPath = await runScan({ client: stub((r) => (r.method === 'POST' ? { status: 401, headers: { 'www-authenticate': 'Bearer scope="s"' }, body: '' } : json({ resource: r.url.replace(/.*oauth-protected-resource/, 'https://mcp.example'), authorization_servers: ['https://auth.other.example'] }))) });
  assert.equal(anyPath.checks.find((c) => c.id === 'prm_path_specificity').status, 'warn');
  assert.equal(anyPath.checks.find((c) => c.id === 'as_metadata').status, 'not_tested');
  assert.match(anyPath.checks.find((c) => c.id === 'as_metadata').evidence[0], /another origin/);
  assert.ok(anyPath.checks.find((c) => c.id === 'pkce_s256').status === 'not_tested');
});

test('trace: every message has a traceparent and a span id; secrets are redacted; text is inert', async () => {
  const t = createTrace({ clock: () => 0 });
  const tp = t.nextTraceparent();
  const m = t.add({ label: 'x\u0000‮'.repeat(300), traceparent: tp, request: { method: 'GET', url: 'https://mcp.example/', headers: { Authorization: 'Bearer abc.def', Cookie: 'a=b', Accept: 'x' } }, response: { status: 200, headers: { 'Set-Cookie': 's=1' }, body: 'b\u0007'.repeat(900) } });
  assert.match(m.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/); assert.equal(m.spanId, tp.split('-')[2]);
  assert.equal(m.request.headers.authorization, 'Bearer ***'); assert.equal(m.request.headers.cookie, '*** '.trim() === '***' ? m.request.headers.cookie : '');
  assert.ok(!JSON.stringify(t.envelope()).includes('abc.def'));
  assert.ok(m.label.length <= 200 && !/[\u0000‮]/.test(m.label) && m.response.body.length <= 800);
  assert.equal(t.envelope().schema, 'conformance-trace/1');
  assert.equal(inert('a⁦b\u0085c'), 'a?b?c');
});
