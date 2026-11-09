// Safety rules: pure functions plus small middlewares. No I/O.
//  1. Loopback bind only unless CONFLAB_BIND is set on purpose (the container sets it; compose publishes on 127.0.0.1).
//  2. Host header must be a loopback name, or a LAB_ALLOWED_HOSTS name on this lab's port (DNS-rebinding defence).
//  3. A write must be same-origin JSON: Origin must match Host, a cross-site Sec-Fetch-Site is refused.
//  4. Every host in any shipped text is reserved (.invalid / .example / apex of example.com|net|org) or loopback.
//  5. Ports are 4900-4949 and never one of the reserved ones.
export const PORT_MIN = 4900;
export const PORT_MAX = 4949;
export const DEFAULT_PORT = 4901;
const FORBIDDEN_PORTS = new Set([5000, 8080, 5173, 3900, 4000, 4400, 4510, 4840, 4600, 4601, 18080, 19080, 19090]);

export function isLoopbackHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h);
}

export function portProblem(port) {
  if (!Number.isInteger(port)) return 'port is not an integer';
  if (FORBIDDEN_PORTS.has(port)) return `port ${port} is reserved for something else`;
  if (port < PORT_MIN || port > PORT_MAX) return `port ${port} is outside ${PORT_MIN}-${PORT_MAX}`;
  return null;
}

export function resolveBind(env = process.env) {
  const host = env.CONFLAB_HOST || '127.0.0.1';
  const raw = env.CONFLAB_PORT;
  const port = raw === undefined || raw === '' ? DEFAULT_PORT : Number(raw);
  const problem = portProblem(port);
  if (problem) throw new Error(problem);
  if (!isLoopbackHost(host) && !env.CONFLAB_BIND) throw new Error(`refusing to bind ${host}: loopback only. Set CONFLAB_BIND=1 to opt in.`);
  return { host, port };
}

export function isReservedHost(host) {
  const h = String(host).toLowerCase().replace(/\.$/, '');
  return /(^|\.)(invalid|example)$/.test(h) || /^example\.(com|net|org)$/.test(h);
}

const NETWORK_URL = /\b(?:https?|wss?|ftp|ssh|tcp|udp):\/\/([^\s/?#"'<>\\]+)/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const stripAuthority = (a) => a.replace(/^[^@]*@/, '').replace(/:\d+$/, '');

// Hostnames and IPs in text that are neither reserved nor loopback. `allow` lists exact extra hosts (spec citation sites).
export function scanHosts(text, allow = []) {
  const found = new Set();
  const s = String(text);
  for (const m of s.matchAll(NETWORK_URL)) found.add(stripAuthority(m[1]).toLowerCase());
  for (const m of s.matchAll(EMAIL)) found.add(m[1].toLowerCase());
  for (const m of s.matchAll(IPV4)) found.add(m[0]);
  return [...found].filter((h) => !isReservedHost(h) && !isLoopbackHost(h) && !allow.includes(h)).sort();
}

const hostOf = (raw) => {
  const r = String(raw || '').toLowerCase();
  return r.startsWith('[') ? r.slice(0, r.indexOf(']') + 1) : r.replace(/:\d+$/, '');
};

// Behind the family launcher (lab-proxy) the Host is this lab's own name plus its port, e.g. "<name>:4901". LAB_ALLOWED_HOSTS is a
// comma list of those names (no ports). Loopback always works; unset means loopback only. Parsed once, at import, before any
// server or timer starts.
export function parseAllowedHosts(value) {
  return new Set(String(value ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}
export const LAB_ALLOWED_HOSTS = parseAllowedHosts(process.env.LAB_ALLOWED_HOSTS);
const LAB_PORT = Number(process.env.CONFLAB_PORT) || DEFAULT_PORT;

// True only for "<allowed name>:<this lab's port>".
export function isLabProxyHost(hostHeader, allowed = LAB_ALLOWED_HOSTS, port = LAB_PORT) {
  const m = /^([a-z0-9.-]+):(\d{1,5})$/i.exec(String(hostHeader ?? '').trim());
  return Boolean(m) && allowed.has(m[1].toLowerCase()) && Number(m[2]) === port;
}

// A proxied write: Host is an allowed lab-proxy name (loopback does not count), and the browser's Origin equals the origin the
// proxy reports in X-Forwarded-Proto/-Host. Forwarded headers are ignored on any other Host.
export function isProxiedSameOrigin(headers, allowed = LAB_ALLOWED_HOSTS, port = LAB_PORT) {
  if (!isLabProxyHost(headers.host, allowed, port)) return false;
  const xfh = String(headers['x-forwarded-host'] || '').trim().toLowerCase();
  const xfp = String(headers['x-forwarded-proto'] || '').trim().toLowerCase();
  return xfh !== '' && (xfp === 'https' || xfp === 'http') && headers.origin === `${xfp}://${xfh}`;
}

export function makeHostCheck(allowed = LAB_ALLOWED_HOSTS, port = LAB_PORT) {
  return function hostCheck(req, res, next) {
    if (!isLoopbackHost(hostOf(req.headers.host)) && !isLabProxyHost(req.headers.host, allowed, port)) return res.status(403).json({ error: 'bad_host', message: 'Host must be a loopback name' });
    next();
  };
}
export const hostCheck = makeHostCheck();

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export function makeSameOriginWrites(allowed = LAB_ALLOWED_HOSTS, port = LAB_PORT) {
  return function sameOriginWrites(req, res, next) {
    if (!WRITES.has(req.method)) return next();
    const origin = req.headers.origin;
    const site = req.headers['sec-fetch-site'];
    if (site && !['same-origin', 'none'].includes(site)) return res.status(403).json({ error: 'cross_site', message: 'Writes must be same-origin' });
    let ok = Boolean(origin) && isProxiedSameOrigin(req.headers, allowed, port);
    if (origin && !ok) { try { ok = new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase(); } catch { ok = false; } }
    if (!ok) return res.status(403).json({ error: 'cross_origin', message: 'Writes need an Origin header equal to Host' });
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'unsupported_media_type', message: 'Send application/json' });
    next();
  };
}
export const sameOriginWrites = makeSameOriginWrites();
