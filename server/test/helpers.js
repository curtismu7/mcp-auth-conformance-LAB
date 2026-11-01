import { listenInRange } from '../src/ports.js';
import { createApp } from '../src/app.js';

// Start the app on a port inside 4902-4949.
export async function startAppInRange(env = {}) {
  const { app, health } = await createApp({ env, clock: () => 0 });
  await health.ready;
  const http = await import('node:http');
  const server = http.createServer(app);
  const port = await listenInRange(server, '127.0.0.1', 4902, 4929);
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { base, port, post, get: (p) => fetch(base + p), stop: () => { health.stop(); server.close(); server.closeAllConnections?.(); } };
}
