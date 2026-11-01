// Mounts a mock on a loopback HTTP listener (for probe demos and tests). Loopback only; never binds anything else.
import http from 'node:http';
import { createMock } from './mock.js';
import { listenInRange } from './ports.js';

export async function startMockServer({ defects = [], vertical = 'banking', port = 0, host = '127.0.0.1' } = {}) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('mock server binds loopback only');
  let mock;
  const server = http.createServer((req, res) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= 65536) chunks.push(c); });
    req.on('end', () => {
      const r = mock.handle({ method: req.method, url: `${mock.origin}${req.url}`, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(r.status, r.headers); res.end(r.body);
    });
  });
  const actual = port ? await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server.address().port)); }) : await listenInRange(server, host, 4930, 4949);
  mock = createMock({ defects, vertical, origin: `http://${host === '::1' ? '[::1]' : host}:${actual}` });
  return { mock, port: actual, origin: mock.origin, close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }) };
}
