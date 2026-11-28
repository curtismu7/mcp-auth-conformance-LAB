// AirGuard Airlines (a fictional airline) is the default story. The conformance rules are domain-free; only the cast changes.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAppInRange } from './helpers.js';
import { installNetguard } from '../src/netguard.js';
import { createMock, getVertical, VERTICALS } from '../src/mock.js';
import { SCENARIOS, renderScenario, getVertical as getStoryVertical } from '../src/stories.js';
import { scanMock, runScenario } from '../src/scenarios.js';
import { startMockServer } from '../src/mock-http.js';

let app; let guard;
before(async () => { guard = installNetguard(); app = await startAppInRange(); });
after(() => { app.stop(); guard.uninstall(); });

// Brands of the other packs and of earlier airline names. None may appear in an airline run.
const RETIRED = ['Meridian', 'Skyline', 'Harbor', 'Fieldstone', 'Northwind', 'Fabrikam', 'Contoso', 'Vellum', 'Tessera', 'Larkspur', 'Concierge Assistant', 'Travel Assistant'];
const leaks = (text) => RETIRED.filter((w) => text.includes(w));

test('the first pack and the default is airlines (AirGuard Airlines); banking and retail stay as packs', () => {
  assert.deepEqual(VERTICALS.map((v) => v.id), ['airlines', 'banking', 'retail']);
  assert.equal(getVertical('airlines').cast.org, 'AirGuard Airlines');
  assert.equal(createMock().cast.org, 'AirGuard Airlines');
  assert.equal(getVertical('banking').cast.org, 'Harbor Credit');
  assert.equal(getVertical('retail').cast.org, 'Fieldstone Goods');
});

test('the catalog names the default and a request with no vertical runs the airline story', async () => {
  const cat = await (await app.get('/api/catalog')).json();
  assert.equal(cat.defaultVertical, 'airlines');
  assert.equal(cat.verticals[0].cast.org, 'AirGuard Airlines');
  const s = await (await app.get('/api/scenarios/S02')).json();
  assert.match(s.title, /^AirGuard Airlines:/);
  const run = await (await app.post('/api/scenario', { id: 'S15' })).json();
  assert.equal(run.vertical, 'airlines'); assert.equal(run.pass, true, run.problems);
});

test('unhappy path: an unknown vertical falls back to the airline mock; the API still refuses it with 400', async () => {
  assert.equal(createMock({ vertical: 'zzz' }).cast.org, 'AirGuard Airlines');
  assert.equal((await app.post('/api/scan', { defects: [], vertical: 'zzz' })).status, 400);
  assert.equal((await app.post('/api/scenario', { id: 'S01', vertical: 'zzz' })).status, 400);
});

test('unhappy path: the earlier ids airline and travel (a saved config) still resolve to the airlines pack', async () => {
  for (const id of ['airline', 'travel']) {
    assert.equal(getVertical(id).id, 'airlines'); assert.equal(getStoryVertical(id).id, 'airlines');
    const j = await (await app.post('/api/scan', { defects: [], vertical: id })).json();
    assert.equal(j.score, 100);
  }
});

test('the airline pack fills every token in every scenario and names only airline tools and scopes', () => {
  const air = getVertical('airlines');
  assert.deepEqual(Object.keys(air.cast).sort(), Object.keys(getVertical('banking').cast).sort());
  for (const s of SCENARIOS) assert.ok(!JSON.stringify(renderScenario(s, air)).includes('{{'), s.id);
  assert.equal(air.cast.readTool, 'get_itinerary'); assert.equal(air.cast.writeTool, 'issue_refund');
  for (const k of ['readScope', 'writeScope']) assert.match(air.cast[k], /^[a-z]+:[a-z]+$/);
});

test('retired names: no old brand anywhere in the airline run (pack, stories, scorecards, traces, mock metadata)', async () => {
  assert.deepEqual(leaks(JSON.stringify(getVertical('airlines'))), []);
  for (const s of SCENARIOS) assert.deepEqual(leaks(JSON.stringify(renderScenario(s, getVertical('airlines')))), [], s.id);
  for (const s of SCENARIOS.filter((x) => x.kind === 'scan' || x.kind === 'stepup')) {
    const r = await runScenario(s.id, 'airlines'); assert.equal(r.pass, true, `${s.id}: ${r.problems}`);
    assert.deepEqual(leaks(JSON.stringify(r)), [], s.id);
  }
  const card = await scanMock([], 'airlines'); assert.deepEqual(leaks(JSON.stringify(card)), []);
  const srv = await startMockServer({});
  try {
    const prm = await (await fetch(`${srv.origin}/.well-known/oauth-protected-resource/mcp`)).text();
    assert.deepEqual(leaks(prm), []); assert.match(prm, /itineraries:read/);
  } finally { await srv.close?.(); }
});

test('the three packs each still run every scenario and keep their own brand', async () => {
  for (const [id, org] of [['airlines', 'AirGuard Airlines'], ['banking', 'Harbor Credit'], ['retail', 'Fieldstone Goods']]) {
    assert.equal(renderScenario(SCENARIOS.find((s) => s.id === 'S02'), getVertical(id)).title.startsWith(org), true, id);
    const r = await runScenario('S15', id); assert.equal(r.pass, true, `${id}: ${r.problems}`);
  }
});
