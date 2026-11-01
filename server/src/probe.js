// Probe mode: read-only checks against ONE URL the user typed. Hard rules, all pinned by tests:
//  - one origin (scheme+host+port) is locked from the typed URL; any request to another origin is refused, redirects included
//  - https only; http only for a loopback host the user typed; no userinfo
//  - external (non-loopback) targets are OFF unless allowExternal (env CONFLAB_PROBE_EXTERNAL=1); default build never leaves loopback
//  - SSRF guard: every resolved address must be public unicast (or the typed loopback); the connection is pinned to the checked address
//  - at most 3 same-origin redirects, 10 s hard wall-clock deadline per request (not an idle timeout), 256 KB response cap, GET and POST only, no credentials (Authorization/Cookie are never sent)
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { isIP } from 'node:net';
import { classifyAddress } from './ipguard.js';
import { isLoopbackHost } from './safety.js';
import { permit } from './netguard.js';

export const PROBE_LIMITS = Object.freeze({ timeoutMs: 10_000, maxBytes: 256 * 1024, maxRedirects: 3, maxRequestBytes: 4096 });
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const SEND = new Set(['accept', 'content-type', 'traceparent']);
const UA = 'mcp-auth-conformance-lab/0.1 (read-only probe)';
const bare = (h) => h.replace(/^\[|\]$/g, '');

// Parse and vet the typed URL. -> { ok, reason?, url?, origin?, loopback? }
export function validateProbeTarget(input, { allowExternal = false } = {}) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return { ok: false, reason: 'bad_url' }; }
  if (u.username || u.password) return { ok: false, reason: 'credentials_in_url' };
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'scheme_not_allowed' };
  const host = bare(u.hostname);
  if (!host) return { ok: false, reason: 'bad_url' };
  const loopback = isLoopbackHost(host);
  if (u.protocol === 'http:') { if (!loopback) return { ok: false, reason: 'scheme_not_https' }; }
  else if (u.protocol !== 'https:') return { ok: false, reason: 'scheme_not_allowed' };
  if (!loopback) {
    if (!allowExternal) return { ok: false, reason: 'external_probe_disabled' };
    if (isIP(host)) { const c = classifyAddress(host); if (!c.ok) return { ok: false, reason: `address_blocked:${c.reason}` }; }
  }
  u.hash = '';
  return { ok: true, url: u.href, origin: u.origin, loopback };
}

// The real transport: pinned address, size cap, timeout. Injected in tests for external targets.
export function nodeTransport({ address, family, host, port, tls, path, method, headers, body, timeoutMs, maxBytes }) {
  return new Promise((resolve) => {
    const mod = tls ? https : http;
    let done = false;
    let timer;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const req = mod.request({
      host: address, family, port, path, method, headers: { ...headers, host: port === (tls ? 443 : 80) ? host : `${host}:${port}` }, agent: false, servername: tls && !isIP(host) ? host : undefined,
      lookup: (_h, _o, cb) => cb(null, address, family),
    }, (res) => {
      const chunks = []; let size = 0; let truncated = false;
      res.on('data', (c) => { size += c.length; if (size > maxBytes) { truncated = true; req.destroy(); return; } chunks.push(c); });
      const end = () => finish({ status: res.statusCode, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])), body: Buffer.concat(chunks).toString('utf8'), truncated });
      res.on('end', end); res.on('close', end);
    });
    // Hard wall-clock deadline for the whole exchange (connect + headers + body); a trickling server cannot extend it.
    timer = setTimeout(() => { finish({ status: 0, headers: {}, body: '', error: 'timeout' }); req.destroy(); }, timeoutMs);
    timer.unref?.();
    req.on('error', (e) => finish({ status: 0, headers: {}, body: '', error: e.code || e.message }));
    if (body) req.write(body);
    req.end();
  });
}

// -> client with the engine's interface: { kind, origin, active:false, request(req) }
// Default resolver. The netguard refuses every non-loopback lookup, so the one hostname the user typed is permitted for this lookup only.
export const defaultResolve = (h) => permit(h, 0, () => dns.promises.lookup(h, { all: true })).then((a) => a.map((x) => x.address));

export function createProbeClient({ url, allowExternal = false, resolve = defaultResolve, transport = nodeTransport } = {}) {
  const target = validateProbeTarget(url, { allowExternal });
  if (!target.ok) throw Object.assign(new Error(`probe target refused: ${target.reason}`), { code: 'probe_refused', reason: target.reason });
  const origin = target.origin;
  const requests = [];

  async function request({ method = 'GET', url: raw, headers = {}, body }) {
    const m = String(method).toUpperCase();
    if (m !== 'GET' && m !== 'POST') return { status: 0, headers: {}, body: '', blocked: 'method_not_allowed' };
    if (body && Buffer.byteLength(body) > PROBE_LIMITS.maxRequestBytes) return { status: 0, headers: {}, body: '', blocked: 'request_too_large' };
    const sendHeaders = { 'user-agent': UA };
    for (const [k, v] of Object.entries(headers)) if (SEND.has(k.toLowerCase())) sendHeaders[k.toLowerCase()] = String(v).replace(/[\r\n]/g, ' ');
    let cur = raw; const hops = [];
    const deadline = Date.now() + PROBE_LIMITS.timeoutMs; // one 10 s budget for the whole request, redirects included
    for (let i = 0; i <= PROBE_LIMITS.maxRedirects; i++) {
      let u; try { u = new URL(cur); } catch { return { status: 0, headers: {}, body: '', blocked: 'bad_url', hops }; }
      if (u.origin !== origin) return { status: 0, headers: {}, body: '', blocked: i === 0 ? 'cross_origin' : 'cross_origin_redirect', hops, blockedUrl: u.origin };
      const host = bare(u.hostname);
      let addrs;
      if (isIP(host)) addrs = [host];
      else if (isLoopbackHost(host)) addrs = [host === 'localhost' ? '127.0.0.1' : host];
      else { try { addrs = await resolve(host); } catch { return { status: 0, headers: {}, body: '', blocked: 'unresolvable', hops }; } }
      if (!addrs.length) return { status: 0, headers: {}, body: '', blocked: 'unresolvable', hops };
      for (const a of addrs) {
        const c = classifyAddress(a);
        if (c.ok) continue;
        if (c.loopback && target.loopback && isLoopbackHost(host)) continue; // the user typed a loopback target
        return { status: 0, headers: {}, body: '', blocked: `ssrf:${c.loopback ? 'dns_to_loopback' : c.reason}`, hops };
      }
      const address = addrs[0]; const family = isIP(address);
      const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
      requests.push(`${m} ${u.origin}${u.pathname}`);
      const run = () => transport({ address, family, host, port, tls: u.protocol === 'https:', path: u.pathname + u.search, method: m, headers: sendHeaders, body, timeoutMs: Math.max(1, deadline - Date.now()), maxBytes: PROBE_LIMITS.maxBytes });
      const res = await (classifyAddress(address).loopback ? run() : permit(address, port, run));
      hops.push({ url: u.href, status: res.status });
      if (REDIRECTS.has(res.status) && res.headers?.location) { cur = new URL(res.headers.location, u).href; continue; }
      return { ...res, hops };
    }
    return { status: 0, headers: {}, body: '', blocked: 'too_many_redirects', hops };
  }
  return { kind: 'probe', origin, targetUrl: target.url, active: false, request, requests };
}
