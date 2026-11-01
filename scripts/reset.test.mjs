import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/src/app.js';
import { listenInRange } from '../server/src/ports.js';
import { installNetguard } from '../server/src/netguard.js';
import { reset } from './reset.mjs';

test('the reset script clears the last scorecard of a running lab and refuses a non-loopback host', async () => {
  const guard = installNetguard();
  const { app, health } = await createApp();
  const server = http.createServer(app);
  const port = await listenInRange(server, '127.0.0.1', 4902, 4949);
  const base = `http://127.0.0.1:${port}`;
  try {
    const scan = await fetch(`${base}/api/scan`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{"defects":[]}' });
    assert.equal(scan.status, 200);
    assert.equal((await (await fetch(`${base}/api/last`)).json()).schema, 'conformance-scorecard/1');
    assert.deepEqual(await reset(base), { reset: 'ok' });
    assert.equal((await (await fetch(`${base}/api/last`)).json()).empty, true);
    await assert.rejects(reset('http://example.invalid:4901'), /loopback only/);
  } finally { health.stop(); server.close(); server.closeAllConnections?.(); guard.uninstall(); }
});
