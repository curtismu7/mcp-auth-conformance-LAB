import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHECKS } from '../src/engine.js';
import { DEFECTS, VERTICALS } from '../src/mock.js';
import { REFS, REF_BY_ID } from '../src/references.js';
import { SCENARIOS, storyCorpus, renderScenario } from '../src/stories.js';
import { scanHosts } from '../src/safety.js';
import { STORY_HOST_ALLOW } from '../src/hosts.js';
import { CLIENTS } from '../src/clients.js';

const refsMd = fs.readFileSync(new URL('../../docs/references.md', import.meta.url), 'utf8');

test('rules are data and consistent: unique ids, known levels, known references, defect expectations name real checks', () => {
  const ids = CHECKS.map((c) => c.id); assert.equal(new Set(ids).size, ids.length);
  for (const c of CHECKS) { assert.ok(['MUST', 'SHOULD', 'MAY'].includes(c.level), c.id); assert.ok(c.clause && c.why && c.fix && c.title, c.id); for (const s of c.spec) assert.ok(REF_BY_ID.has(s), `${c.id}: ${s}`); }
  const set = new Set(ids);
  for (const d of DEFECTS) for (const id of [...d.fails, ...(d.warns || [])]) assert.ok(set.has(id), `${d.id}: ${id}`);
  assert.ok(DEFECTS.filter((d) => d.fails.length).length >= 10, 'at least 10 selectable defects');
  assert.equal(new Set(DEFECTS.map((d) => d.id)).size, DEFECTS.length);
});

test('the ten required defects are all present', () => {
  const ids = new Set(DEFECTS.map((d) => d.id));
  for (const need of ['missing_prm', 'bad_www_authenticate', 'http_metadata_url', 'no_pkce_s256', 'resource_ignored', 'no_iss', 'wrong_403', 'dcr_open', 'cimd_unsupported', 'metadata_stale']) assert.ok(ids.has(need), need);
});

test('every reference is recorded in docs/references.md with a verified or UNVERIFIED flag; verified ones have a URL', () => {
  for (const r of REFS) {
    assert.ok(refsMd.includes(`\`${r.id}\``), `${r.id} missing from references.md`);
    if (r.verified) assert.ok(r.url && refsMd.includes(r.url), `${r.id} url not recorded`);
    else assert.equal(r.url, null);
  }
  assert.match(refsMd, /UNVERIFIED/);
});

test('stories: all three verticals share a cast shape, every token fills, no raw {{ left, and every host is reserved', () => {
  const keys = (v) => Object.keys(v.cast).sort().join();
  for (const v of VERTICALS) assert.equal(keys(v), keys(VERTICALS[0]), v.id);
  assert.equal(VERTICALS.length, 3);
  for (const s of SCENARIOS) for (const v of VERTICALS) assert.ok(!JSON.stringify(renderScenario(s, v)).includes('{{'), `${s.id}/${v.id}`);
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  for (const { where, text } of storyCorpus()) assert.deepEqual(scanHosts(text, STORY_HOST_ALLOW), [], where);
});

test('no real-looking hosts or secrets in data and source (only reserved names and cited documentation sites)', () => {
  for (const dir of ['../data/', '../src/']) for (const f of fs.readdirSync(new URL(dir, import.meta.url))) {
    const s = fs.readFileSync(new URL(dir + f, import.meta.url), 'utf8');
    assert.ok(!/auth\.pingone\.|pingidentity\.com|BEGIN (RSA |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\./.test(s), f);
    const hosts = scanHosts(s, [...STORY_HOST_ALLOW, 'json-schema.org']).filter((h) => !/^(0\.0\.0\.0|\d+\.\d+\.\d+\.\d+)$/.test(h) && !h.includes('${'));
    assert.deepEqual(hosts, [], f);
  }
});

test('the client reference labels what it could not verify', () => {
  for (const c of CLIENTS.clients) {
    assert.ok(REF_BY_ID.has(c.source)); assert.equal(c.verified, REF_BY_ID.get(c.source).verified, c.id);
    if (!c.verified) assert.ok(c.requirements.every((r) => r.level === 'UNVERIFIED'), c.id);
  }
});
