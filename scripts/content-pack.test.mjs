import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { validatePack } from './validate-content-pack.mjs';
import { buildPack } from './build-content-pack.mjs';
import { portProblem } from '../server/src/safety.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

test('content-pack.json validates against the schema and matches what the builder would write', () => {
  const pack = read('content-pack.json');
  assert.deepEqual(validatePack(pack), []);
  assert.deepEqual(pack, JSON.parse(JSON.stringify(buildPack())), 'run npm run content-pack');
});

test('every story in the pack is a scenario, every source URL is recorded in docs/references.md, unverified sources are not marked verified', () => {
  const pack = read('content-pack.json'); const md = fs.readFileSync(new URL('../docs/references.md', import.meta.url), 'utf8');
  const scenarios = new Set(read('server/data/scenarios.json').map((s) => s.id));
  for (const s of pack.stories) assert.ok(scenarios.has(s.id), s.id);
  for (const s of pack.sources) assert.ok(md.includes(s.url), s.url);
  assert.ok(pack.sources.some((s) => s.status === 'verified'));
  assert.ok(!pack.stories.some((s) => s.title.includes('{{')));
});

test('the app is one build for two catalog rows: the pack schema takes a single id (D35), the shelf entry and README carry D35+D2', () => {
  assert.equal(read('content-pack.json').demo.catalog, 'D35');
  assert.equal(read('docs/shelf-entry.json').demos[0].catalogId, 'D35+D2');
});

test('shelf entry: catalog id D35+D2, health path, port in range, composeFile is the repo folder (demo-root relative), never an absolute path', () => {
  const { demos } = read('docs/shelf-entry.json'); assert.equal(demos.length, 1);
  const d = demos[0];
  assert.equal(d.catalogId, 'D35+D2'); assert.equal(d.healthPath, '/api/health'); assert.equal(d.id, 'mcp-auth-conformance-lab');
  assert.equal(portProblem(Number(new URL(d.url).port)), null);
  assert.ok(!d.composeFile.startsWith('/') && !/^[A-Za-z]:\\/.test(d.composeFile) && !d.composeFile.includes('/Users/'), 'no absolute author path');
  assert.equal(d.composeFile, 'mcp-auth-conformance-LAB/docker-compose.yml');
  assert.equal(d.kind, 'Tester');
  assert.ok(fs.existsSync(new URL('../docker-compose.yml', import.meta.url)));
});
