// The real Express app (same code `npm start` runs) on an ephemeral loopback port, with fetch() pointed at it. The UI under test talks to the
// real engine and mocks over real loopback HTTP. Writes carry a same-origin Origin header, as a browser would.
import { createApp } from "../../../server/src/app.js";
import { listenInRange } from "../../../server/src/ports.js";
import http from "node:http";

const realFetch = globalThis.fetch;

export async function startLive() {
  const { app, health } = await createApp();
  const server = http.createServer(app);
  const port = await listenInRange(server, "127.0.0.1", 4902, 4949);
  const base = `http://127.0.0.1:${port}`;
  globalThis.fetch = (path, init = {}) => realFetch(`${base}${path}`, { ...init, headers: { origin: base, ...(init.headers || {}) } });
  return { base, stop: async () => { globalThis.fetch = realFetch; health.stop?.(); await new Promise((r) => server.close(r)); } };
}
