import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChallenges, param, LIMITS } from '../src/wwwauth.js';

const codes = (v) => parseChallenges(v).problems.map((p) => p.code);

test('well-formed MCP challenges parse with no problems', () => {
  const r = parseChallenges('Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/mcp", scope="files:read files:write"');
  assert.deepEqual(r.problems, []);
  assert.equal(param(r.challenges[0], 'scope'), 'files:read files:write');
  assert.equal(param(parseChallenges('Bearer error="insufficient_scope", scope="a b", resource_metadata="https://x.example/p", error_description="more, please"').challenges[0], 'error_description'), 'more, please');
});

test('the empty first auth-param, doubled commas, trailing commas, missing quotes and bare Bearer are each named', () => {
  assert.deepEqual(codes('Bearer , resource_metadata="x"'), ['empty_first_param']);
  assert.deepEqual(codes('Bearer realm="a",, scope=b'), ['empty_element']);
  assert.deepEqual(codes('Bearer realm="a",'), ['empty_element']);
  assert.deepEqual(codes('Bearer a="x'), ['unterminated_quote']);
  assert.deepEqual(codes('Bearer a=1 b=2'), ['missing_comma']);
  assert.deepEqual(codes(''), ['no_scheme']);
  assert.deepEqual(codes('   '), ['no_scheme']);
  assert.deepEqual(parseChallenges('Bearer').challenges[0].params, []);
});

test('several challenges in one header are split', () => {
  const r = parseChallenges('Bearer realm="a", Basic realm="b"');
  assert.deepEqual(r.challenges.map((c) => c.scheme), ['Bearer', 'Basic']);
  assert.deepEqual(r.problems, []);
});

test('hostile input: huge, repetitive and malformed headers finish fast, never throw, and respect the limits', () => {
  const cases = [
    'Bearer ' + 'a=1,'.repeat(200000), 'Bearer ' + ','.repeat(1_000_000), 'Bearer ' + '"'.repeat(500000), 'Bearer a="' + '\\'.repeat(500000),
    'Bearer'.repeat(100000), 'B ' + 'x,'.repeat(100000), '\u0000\u0001Bearer \uD800 a=\uDFFF', 'Bearer a=' + '='.repeat(300000), Array(5000).fill('Bearer a=1').join(', '),
  ];
  const t = Date.now();
  for (const c of cases) { const r = parseChallenges(c); assert.ok(Array.isArray(r.challenges) && Array.isArray(r.problems)); assert.ok(r.problems.length <= 20); assert.ok(r.challenges.length <= LIMITS.maxChallenges); }
  assert.ok(Date.now() - t < 2000, `took ${Date.now() - t} ms`);
  assert.deepEqual(codes('Bearer ' + 'x'.repeat(LIMITS.maxLength)), ['too_long']);
  assert.deepEqual(parseChallenges(undefined).problems.map((p) => p.code), ['no_scheme']);
});
