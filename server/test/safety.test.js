import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import dns from 'node:dns';
import dgram from 'node:dgram';
import fs from 'node:fs';
import { resolveBind, portProblem, isLoopbackHost, scanHosts, isReservedHost, hostCheck, sameOriginWrites } from '../src/safety.js';
import { installNetguard, netguardSelfTest } from '../src/netguard.js';
import { listenInRange } from '../src/ports.js';
import { DEFECT_IDS } from '../src/mock.js';
import { scanMock, runAllScenarios } from '../src/scenarios.js';

test('bind: loopback by default on 4901; non-loopback refused unless CONFLAB_BIND; ports pinned to 4900-4949', () => {
  assert.deepEqual(resolveBind({}), { host: '127.0.0.1', port: 4901 });
  for (const h of ['0.0.0.0', '192.168.1.5', '::', 'example.com']) assert.throws(() => resolveBind({ CONFLAB_HOST: h }), /loopback only/, h);
  assert.equal(resolveBind({ CONFLAB_HOST: '0.0.0.0', CONFLAB_BIND: '1' }).host, '0.0.0.0');
  for (const p of ['5000', '8080', '5173', '3900', '4000', '4400', '4510', '4840', '4899', '4950', 'abc', '0']) assert.throws(() => resolveBind({ CONFLAB_PORT: p }), /port/, p);
  assert.equal(resolveBind({ CONFLAB_PORT: '4949' }).port, 4949);
  assert.equal(portProblem(4900), null);
  assert.ok(isLoopbackHost('127.9.9.9') && isLoopbackHost('[::1]') && !isLoopbackHost('127.0.0.1.evil.example'));
});

test('listenInRange refuses a range outside 4900-4949 and stays inside it', async () => {
  const http = await import('node:http');
  await assert.rejects(listenInRange(http.createServer(), '127.0.0.1', 5000, 5010), /outside 4900-4949/);
  const s = http.createServer(); const port = await listenInRange(s, '127.0.0.1', 4902, 4929);
  assert.ok(port >= 4902 && port <= 4929); s.close();
});

test('host check and same-origin writes', () => {
  const run = (mw, req) => { const out = {}; const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } }; mw(req, res, () => { out.next = true; }); return out; };
  assert.equal(run(hostCheck, { headers: { host: '127.0.0.1:4901' } }).next, true);
  assert.equal(run(hostCheck, { headers: { host: 'localhost' } }).next, true);
  assert.equal(run(hostCheck, { headers: { host: 'evil.example' } }).status, 403);
  assert.equal(run(hostCheck, { headers: { host: 'localhost.evil.example:4901' } }).status, 403);
  const ok = { method: 'POST', headers: { host: '127.0.0.1:4901', origin: 'http://127.0.0.1:4901', 'content-type': 'application/json' } };
  assert.equal(run(sameOriginWrites, ok).next, true);
  assert.equal(run(sameOriginWrites, { ...ok, headers: { ...ok.headers, origin: 'http://evil.example' } }).status, 403);
  assert.equal(run(sameOriginWrites, { ...ok, headers: { host: ok.headers.host, 'content-type': 'application/json' } }).status, 403);
  assert.equal(run(sameOriginWrites, { ...ok, headers: { ...ok.headers, 'sec-fetch-site': 'cross-site' } }).status, 403);
  assert.equal(run(sameOriginWrites, { ...ok, headers: { ...ok.headers, 'content-type': 'text/plain' } }).status, 415);
  assert.equal(run(sameOriginWrites, { method: 'GET', headers: {} }).next, true);
});

test('scanHosts flags real-looking hosts and passes reserved ones', () => {
  assert.deepEqual(scanHosts('see https://mcp.example/x and http://127.0.0.1:4901 and a@b.invalid'), []);
  assert.deepEqual(scanHosts('https://auth.pingone.com/x 8.8.8.8 me@corp.com'), ['8.8.8.8', 'auth.pingone.com', 'corp.com']);
  assert.ok(isReservedHost('Foo.EXAMPLE.') && isReservedHost('example.org') && !isReservedHost('example.org.evil.com'));
});

// Runs fn with dgram send/connect replaced by inert recorders, installed BEFORE the guard so the guard wraps them. If the guard ever lets a
// call through (a mutation or regression), the recorder catches it: no packet is sent, nothing hangs, and the test fails with an assertion.
async function withInertUdp(fn) {
  const saved = { send: dgram.Socket.prototype.send, connect: dgram.Socket.prototype.connect };
  const leaked = [];
  dgram.Socket.prototype.send = function inertSend(...a) { leaked.push(['send', a[0]]); };
  dgram.Socket.prototype.connect = function inertConnect(...a) { leaked.push(['connect', a[1]]); };
  try { return await fn(leaked); } finally { dgram.Socket.prototype.send = saved.send; dgram.Socket.prototype.connect = saved.connect; }
}

test('netguard self-test: it blocks and records fetch, socket, socket-by-IP, dns lookup, dns resolve, udp send and udp connect, and sends nothing', { timeout: 15000 }, async () => {
  const r = await withInertUdp(async (leaked) => { const out = await netguardSelfTest(); assert.deepEqual(leaked, [], 'a UDP call passed the guard'); return out; });
  assert.deepEqual({ ok: r.ok, blocked: r.blocked, total: r.total }, { ok: true, blocked: 8, total: 8 });
  const g = installNetguard();
  try {
    assert.throws(() => net.connect({ host: '203.0.113.9', port: 80 }), /netguard: blocked connect/);
    await assert.rejects(dns.promises.lookup('victim.example'), /netguard: blocked lookup/);
    assert.equal(g.attempts.length, 2);
  } finally { g.uninstall(); }
  assert.equal(typeof net.Socket.prototype.connect, 'function');
});

test('netguard refuses a UDP connect and a UDP send whose message text looks like a loopback address', { timeout: 15000 }, async () => {
  await withInertUdp(async (leaked) => {
    const g = installNetguard();
    try {
      const s = dgram.createSocket('udp4');
      try {
        assert.throws(() => s.connect(9, '198.51.100.7'), /netguard: blocked udp-connect/);
        assert.throws(() => s.send('127.0.0.1', 9, '198.51.100.7'), /netguard: blocked udp/);
        assert.throws(() => s.send(Buffer.from('x'), 0, 1, 9, '203.0.113.5'), /netguard: blocked udp/);
      } finally { s.close(); }
      assert.deepEqual(g.attempts, ['udp-connect:198.51.100.7', 'udp:198.51.100.7', 'udp:203.0.113.5']);
      assert.deepEqual(leaked, [], 'a UDP call passed the guard');
    } finally { g.uninstall(); }
  });
});

test('zero outbound: every defect scan and every scenario in every vertical makes no attempt to leave loopback', async () => {
  const g = installNetguard();
  try {
    for (const d of [[], ...DEFECT_IDS.map((x) => [x])]) await scanMock(d);
    for (const v of ['banking', 'travel', 'retail']) for (const r of await runAllScenarios(v)) assert.equal(r.pass, true, `${r.id}/${v}: ${r.problems}`);
    assert.deepEqual(g.attempts, []);
  } finally { g.uninstall(); }
});

test('the source never calls the sync key generator that aborts under GC on Node 20, and never uses mermaid', () => {
  const needle = ['generate', 'Key', 'Pair', 'Sync'].join('');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' ? [] : e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const root = new URL('../../', import.meta.url).pathname;
  for (const f of walk(root).filter((x) => /\.(js|mjs|jsx|json|html|css)$/.test(x) && !/package-lock/.test(x) && !/safety\.test\.js$/.test(x))) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!s.includes(needle), `${f} uses the sync key generator`);
    assert.ok(!/mermaid/i.test(s), `${f} mentions mermaid`);
  }
});

test('netguard lets a server listen on the unspecified bind address (container mode) but never connect to it', async () => {
  installNetguard();
  const s = net.createServer();
  await listenInRange(s, '0.0.0.0');
  s.close();
  assert.throws(() => net.connect({ host: '0.0.0.0', port: 80 }), /netguard: blocked connect/);
  await assert.rejects(dns.promises.lookup('0.0.0.0'), /netguard: blocked lookup/); // the promise API stays strict
});

test('netguard also refuses the callback form of dns.lookup and a unix socket, and records both', async () => {
  const g = installNetguard();
  try {
    const err = await new Promise((resolve) => dns.lookup('someone-else.invalid', (e) => resolve(e)));
    assert.match(String(err?.message), /netguard: blocked lookup/);
    assert.throws(() => net.connect({ path: '/tmp/netguard-test-no-such.sock' }), /netguard: blocked connect/);
    assert.ok(g.attempts.includes('connect:unix:/tmp/netguard-test-no-such.sock'));
    assert.ok(g.attempts.some((a) => a.startsWith('lookup:someone-else.invalid')));
  } finally { g.uninstall(); }
});
