// The in-process client the engine uses against a mock: same interface as the probe client, no sockets at all.
export function createMockClient(mock) {
  const requests = [];
  return {
    kind: 'mock', origin: mock.origin, targetUrl: mock.resource, active: true, mockCast: mock.cast, requests,
    async request({ method = 'GET', url, headers = {}, body }) {
      let u; try { u = new URL(url); } catch { return { status: 0, headers: {}, body: '', blocked: 'bad_url' }; }
      if (u.origin !== mock.origin) return { status: 0, headers: {}, body: '', blocked: 'cross_origin', blockedUrl: u.origin };
      requests.push(`${method} ${u.pathname}`);
      const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
      const r = mock.handle({ method, url, headers: h, body });
      return { status: r.status, headers: r.headers, body: r.body };
    },
  };
}
