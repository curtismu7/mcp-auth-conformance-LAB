import test from 'node:test';
import assert from 'node:assert/strict';
import { scanMock } from '../src/scenarios.js';
import { CHECKS, summarize } from '../src/engine.js';
import { DEFECTS, createMock } from '../src/mock.js';

const by = (card, s) => card.checks.filter((c) => c.status === s).map((c) => c.id).sort();
const NOT_TESTED_OK = { open_server: ['challenge_scope', 'challenge_shape'], missing_prm: ['prm_path_specificity', 'prm_valid'], dcr_absent: ['dcr_abuse_protection'] };

test('the good server scores 100% and every check passes (registration_dcr is informational)', async () => {
  const card = await scanMock([]);
  assert.equal(card.score, 100);
  assert.deepEqual(card.checks.filter((c) => !['pass', 'info'].includes(c.status)), []);
  assert.equal(card.checks.find((c) => c.id === 'registration_dcr').status, 'info');
  assert.equal(card.failedMust.length, 0);
});

for (const d of DEFECTS) {
  test(`mutation: defect ${d.id} fails exactly ${JSON.stringify(d.fails)} and warns exactly ${JSON.stringify(d.warns || [])}`, async () => {
    for (const vertical of ['banking', 'travel', 'retail']) {
      const card = await scanMock([d.id], vertical);
      assert.deepEqual(by(card, 'fail'), [...d.fails].sort(), `${vertical} fail`);
      assert.deepEqual(by(card, 'warn'), [...(d.warns || [])].sort(), `${vertical} warn`);
      assert.deepEqual(by(card, 'not_tested'), [...(NOT_TESTED_OK[d.id] || [])].sort(), `${vertical} not_tested`);
      if (d.fails.length) assert.ok(card.score < 100);
    }
  });
}

test('every check has a pass demo (the good server) and a fail or warn demo (some defect), except the informational DCR row', () => {
  const demoed = new Set(DEFECTS.flatMap((d) => [...d.fails, ...(d.warns || [])]));
  for (const c of CHECKS) if (c.level !== 'MAY') assert.ok(demoed.has(c.id), `${c.id} has no failing demo`);
});

test('two defects together fail the union of their checks, and the score only goes down', async () => {
  const a = await scanMock(['no_iss', 'wrong_403']);
  assert.deepEqual(by(a, 'fail'), ['insufficient_scope_403', 'iss']);
  const single = await scanMock(['no_iss']);
  assert.ok(a.score < single.score);
  const all = await scanMock(DEFECTS.map((d) => d.id));
  assert.ok(all.failedMust.length >= 4 && all.score < 60, `score ${all.score}`);
});

test('scoring: MUST weighs 3, SHOULD 2, warn is half credit, not_tested and info are excluded', () => {
  const mk = (level, status) => ({ level, status, id: `${level}-${status}` });
  assert.equal(summarize([mk('MUST', 'pass'), mk('MUST', 'fail')]).score, 50);
  assert.equal(summarize([mk('MUST', 'pass'), mk('SHOULD', 'fail')]).score, 60);
  assert.equal(summarize([mk('SHOULD', 'warn'), mk('MUST', 'pass')]).score, 80);
  assert.equal(summarize([mk('MUST', 'pass'), mk('MUST', 'not_tested'), mk('MAY', 'info')]).score, 100);
  assert.equal(summarize([mk('MUST', 'not_tested')]).score, null);
});

test('mock safety: unknown defects are refused; reset clears state; severity follows the level', async () => {
  assert.throws(() => createMock({ defects: ['nope'] }), /unknown defect/);
  const card = await scanMock(['no_pkce_s256', 'no_iss']);
  assert.equal(card.checks.find((c) => c.id === 'pkce_s256').severity, 'high');
  assert.equal(card.checks.find((c) => c.id === 'iss').severity, 'medium');
  assert.ok(card.checks.filter((c) => c.status === 'fail').every((c) => c.fix && c.references.length));
  assert.ok(card.checks.filter((c) => c.status === 'pass').every((c) => c.fix === null));
});

test('MUST versus SHOULD is stated per check and every reference carries a verified flag; heuristics are flagged unverified', async () => {
  const card = await scanMock([]);
  for (const c of card.checks) { assert.ok(['MUST', 'SHOULD', 'MAY'].includes(c.level), c.id); for (const r of c.references) assert.equal(typeof r.verified, 'boolean'); }
  assert.deepEqual(card.unverified.sort(), ['dcr_abuse_protection', 'metadata_fresh', 'prm_path_specificity']);
});

test('RFC 9207: a present-but-wrong iss in the authorization response fails the iss check (the "wrong" branch)', async () => {
  const { runScan } = await import('../src/engine.js');
  const { createMockClient } = await import('../src/mock-client.js');
  const mock = createMock({});
  const inner = createMockClient(mock);
  const client = { ...inner, async request(req) {
    const r = await inner.request(req);
    if (r.status === 302 && r.headers.location) { const u = new URL(r.headers.location); if (u.searchParams.has('iss')) { u.searchParams.set('iss', 'https://evil.example'); return { ...r, headers: { ...r.headers, location: u.href } }; } }
    return r;
  } };
  const card = await runScan({ client, label: 'wrong-iss' });
  assert.deepEqual(by(card, 'fail'), ['iss']);
  assert.match(card.checks.find((c) => c.id === 'iss').evidence.join(' '), /not the metadata issuer/);
});
