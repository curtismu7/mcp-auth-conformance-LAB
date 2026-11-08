import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hostCheck, sameOriginWrites } from './safety.js';
import { createHealth } from './health.js';
import { CHECKS, runScan } from './engine.js';
import { DEFECTS, DEFECT_IDS, createMock } from './mock.js';
import { createMockClient } from './mock-client.js';
import { createProbeClient, PROBE_LIMITS } from './probe.js';
import { REFS } from './references.js';
import { publicClients } from './clients.js';
import { SCENARIOS, VERTICALS, getVertical, renderScenario } from './stories.js';
import { runScenario } from './scenarios.js';
import { DIAGRAM_NAMES, getDiagram } from './diagramData.js';
import { shelfInfo } from './shelfLink.js';

// One banner per mode. The page shows the one for the mode in the header, on every tab and in presenter mode.
export const BANNERS = Object.freeze({
  mock: 'Simulated (Mock mode). Targets are in-process mock MCP servers. No tenant, no real authorization server, no outbound network. Switch to Live to use the gated read-only probe.',
  live: 'Live mode. Only the Probe tab goes live: it can send read-only discovery requests to the one URL you type (loopback only unless the owner enabled external probing on the host). Scorecard, Stories, Clients and Diagram still use simulated in-process mock servers. No tenant, no credentials sent.',
});
export const PROBE_ACK = 'I want read-only discovery requests sent to the URL I typed, and nothing else.';
const bad = (res, message, extra = {}) => res.status(400).json({ error: 'bad_request', message, ...extra });
const publicCheck = ({ id, group, title, level, mode, clause, why, fix, spec }) => ({ id, group, title, level, mode, clause, why, fix, spec });

export async function createApp({ env = process.env, clock } = {}) {
  const app = express();
  const health = createHealth();
  const allowExternal = env.CONFLAB_PROBE_EXTERNAL === '1';
  let last = null; let probing = false;
  // Rule 19: the mode is server-side and runtime-switchable (POST /api/mode). Live is always available here:
  // the probe is loopback-only by default and needs no live tenant, so there is no 409 path.
  let mode = 'mock';
  const modeView = () => ({ mode, source: mode === 'mock' ? 'mock' : 'real', realAvailable: true, realReason: null });

  app.disable('x-powered-by');
  app.use(hostCheck);
  app.use((req, res, next) => { res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"); res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  app.use(sameOriginWrites);
  app.use(express.json({ limit: '8kb' }));
  app.use('/api/health', health.router);

  app.get('/api/catalog', (req, res) => res.json({
    banner: BANNERS, diagrams: DIAGRAM_NAMES,
    checks: CHECKS.map(publicCheck), defects: DEFECTS, verticals: VERTICALS, references: REFS.map(({ id, label, url, verified, read }) => ({ id, label, url, verified, read })),
    scenarios: SCENARIOS.map((s) => ({ id: s.id, slug: s.slug, kind: s.kind, title: s.title, steps: s.steps, takeaway: s.takeaway })),
    probe: { externalEnabled: allowExternal, ack: PROBE_ACK, limits: PROBE_LIMITS, rules: ['one origin (the one typed)', 'https only (http only for loopback)', 'GET and POST discovery requests only', 'no credentials sent', 'no redirect to another origin', 'private, link-local and metadata addresses refused', 'checks that need a token or would register a client are not run'] },
  }));
  app.get('/api/diagrams/:name', (req, res) => {
    const d = getDiagram(req.params.name);
    if (!d) return res.status(404).json({ error: 'not_found' });
    res.json(d);
  });
  app.get('/api/clients', (req, res) => res.json(publicClients()));
  app.get('/api/info', (req, res) => res.json(modeView()));
  app.post('/api/mode', (req, res) => {
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => k !== 'source')) return bad(res, 'the only accepted body field is { "source": "mock" | "real" }.');
    if (body.source !== 'mock' && body.source !== 'real') return bad(res, 'source must be "mock" or "real".');
    mode = body.source === 'real' ? 'live' : 'mock';
    res.json(modeView());
  });
  app.get('/api/scenarios/:id', (req, res) => {
    const s = SCENARIOS.find((x) => x.id === req.params.id || x.slug === req.params.id); const v = getVertical(String(req.query.vertical || 'banking'));
    if (!s || !v) return res.status(404).json({ error: 'not_found' });
    res.json(renderScenario(s, v));
  });

  app.post('/api/scan', async (req, res, next) => {
    try {
      const { defects = [], vertical = 'banking' } = req.body || {};
      if (!Array.isArray(defects) || defects.length > DEFECT_IDS.length || defects.some((d) => !DEFECT_IDS.includes(d))) return bad(res, 'defects must be an array of known defect ids.', { ids: DEFECT_IDS });
      if (!getVertical(vertical)) return bad(res, 'unknown vertical.', { ids: VERTICALS.map((v) => v.id) });
      last = await runScan({ client: createMockClient(createMock({ defects, vertical })), clock, label: defects.join('+') || 'good' });
      res.json(last);
    } catch (e) { next(e); }
  });
  app.post('/api/scenario', async (req, res, next) => {
    try {
      const { id, vertical = 'banking' } = req.body || {};
      if (typeof id !== 'string' || !SCENARIOS.some((s) => s.id === id || s.slug === id)) return bad(res, 'id must be a scenario id.', { ids: SCENARIOS.map((s) => s.id) });
      if (!getVertical(vertical)) return bad(res, 'unknown vertical.');
      res.json(await runScenario(id, vertical, { clock }));
    } catch (e) { next(e); }
  });
  // Gated, read-only. The ack text must be echoed back exactly; the URL is vetted before any socket is opened.
  app.post('/api/probe', async (req, res, next) => {
    const { url, confirm, ack } = req.body || {};
    if (typeof url !== 'string' || url.length > 2048) return bad(res, 'url must be a string.');
    if (confirm !== true || ack !== PROBE_ACK) return res.status(412).json({ error: 'confirmation_required', message: 'Probe mode needs confirm: true and the exact acknowledgement text.', ack: PROBE_ACK });
    if (probing) return res.status(429).json({ error: 'probe_busy', message: 'A probe is already running.' });
    probing = true;
    try {
      let client;
      try { client = createProbeClient({ url, allowExternal }); } catch (e) { if (e.code === 'probe_refused') return res.status(422).json({ error: 'probe_refused', reason: e.reason, message: `The probe refused this target: ${e.reason}.` }); throw e; }
      last = await runScan({ client, clock, label: 'probe' });
      res.json({ ...last, requestLog: client.requests });
    } catch (e) { next(e); } finally { probing = false; }
  });
  app.post('/api/reset', (req, res) => { last = null; res.json({ reset: 'ok' }); });
  app.get('/api/last', (req, res) => res.json(last || { schema: 'conformance-scorecard/1', empty: true }));

  const dist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(dist)) app.use(express.static(dist));
  // Before the /api 404 below and outside the web-dist check, so it is reachable with or without a web build.
  app.get('/api/shelf', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(shelfInfo(env)); }); // the header "Shelf" button
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large', message: 'Request body is limited to 8 KB.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_request', message: 'Body is not valid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  });
  return { app, health };
}
