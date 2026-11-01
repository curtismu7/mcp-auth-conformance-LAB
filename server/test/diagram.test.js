import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DIAGRAM_NAMES, getDiagram, loadDiagram } from '../src/diagramData.js';
import { validateDiagram } from '../src/diagramStudioValidate.js';

test('every diagram is valid diagram-studio/1 data and is loaded by name', () => {
  assert.ok(DIAGRAM_NAMES.length >= 1);
  for (const n of DIAGRAM_NAMES) { assert.deepEqual(validateDiagram(loadDiagram(n)), []); assert.equal(getDiagram(n).id, n); }
  for (const bad of ['nope', '__proto__', 'constructor', 7, undefined, null]) assert.equal(getDiagram(bad), null);
});

test('the diagram files on disk are exactly the names the server knows (no stray or missing file)', () => {
  const files = fs.readdirSync(new URL('../diagrams/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(files, [...DIAGRAM_NAMES].sort());
});

test('the flow diagram has the six boxes the scorecard trace maps onto, and every step walks a real arrow', () => {
  const d = getDiagram('mcp-authorization-flow');
  assert.deepEqual(d.nodes.map((n) => n.id), ['client', 'rs', 'prm', 'asm', 'authz', 'scope']);
  assert.ok(d.steps.length >= 6 && d.steps.every((s) => s.edges.length === 1 && s.edges[0] < d.edges.length));
  assert.ok(d.steps.every((s) => /^\d{3}$/.test(s.hop)), 'a step hop is the HTTP status of that hop');
});

test('the validator rejects a broken diagram (the gate is live)', () => {
  const d = structuredClone(getDiagram('mcp-authorization-flow'));
  d.edges[0].target = 'ghost';
  assert.ok(validateDiagram(d).some((p) => /unknown target/.test(p)));
  assert.ok(validateDiagram({ ...d, schema: 'x' }).length > 0);
});
