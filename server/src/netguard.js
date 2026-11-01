// Runtime netguard: zero outbound by default. Every non-loopback socket, DNS lookup, resolver call, UDP send and fetch is
// refused and recorded. The ONLY hole is permit(): the probe opens it for the single validated address of the one URL the
// user typed, for the duration of one request. Nothing in the mock path ever needs it.
import dns from 'node:dns';
import net from 'node:net';
import dgram from 'node:dgram';
import { isLoopbackHost } from './safety.js';

let active = null;
// listen() resolves its bind address through dns.lookup, even for an IP literal. The unspecified addresses are bind targets (opt-in
// container mode only, see safety.resolveBind) and need no DNS query, so the lookup guard lets them through. connect() to them stays refused.
const BIND_LITERALS = new Set(['0.0.0.0', '::']);
const permits = []; // [{ address, port }]

export function permit(address, port, fn) {
  const p = { address: String(address).replace(/^\[|\]$/g, ''), port: Number(port) };
  permits.push(p);
  const done = () => { const i = permits.indexOf(p); if (i >= 0) permits.splice(i, 1); };
  return Promise.resolve().then(fn).finally(done);
}
// port undefined or 0 matches any port (used for the one-hostname DNS lookup).
const permitted = (host, port) => permits.some((p) => p.address === String(host).replace(/^\[|\]$/g, '') && (port === undefined || p.port === 0 || p.port === Number(port)));

export function installNetguard() {
  if (active) return active;
  const attempts = [];
  const real = { connect: net.Socket.prototype.connect, lookup: dns.lookup, plookup: dns.promises.lookup, fetch: globalThis.fetch, send: dgram.Socket.prototype.send, dconnect: dgram.Socket.prototype.connect };
  const refuse = (kind, target) => { attempts.push(`${kind}:${target}`); return new Error(`netguard: blocked ${kind} to ${target}`); };

  net.Socket.prototype.connect = function guardedConnect(...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const o = typeof first === 'object' && first !== null ? first : { port: first, host: typeof args[1] === 'string' ? args[1] : undefined };
    if (o.path) throw refuse('connect', `unix:${o.path}`);
    const host = o.host ?? 'localhost';
    if (!isLoopbackHost(host) && !permitted(host, o.port)) throw refuse('connect', `${host}:${o.port}`);
    return real.connect.apply(this, args);
  };
  dns.lookup = function guardedLookup(host, ...rest) {
    if (!isLoopbackHost(host) && !permitted(host) && !BIND_LITERALS.has(host)) {
      const err = refuse('lookup', host); const cb = rest.at(-1);
      if (typeof cb === 'function') return process.nextTick(cb, err);
      throw err;
    }
    return real.lookup.call(dns, host, ...rest);
  };
  dns.promises.lookup = async function guardedPLookup(host, ...rest) {
    if (!isLoopbackHost(host) && !permitted(host)) throw refuse('lookup', host);
    return real.plookup.call(dns.promises, host, ...rest);
  };
  const RESOLVERS = ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveMx', 'resolveNs', 'resolveSrv', 'resolveTxt', 'reverse'];
  const saved = [];
  for (const [holder, isPromise] of [[dns, false], [dns.promises, true], [dns.Resolver.prototype, false], [dns.promises.Resolver.prototype, true]]) {
    for (const name of RESOLVERS) {
      const orig = holder[name]; if (typeof orig !== 'function') continue;
      saved.push([holder, name, orig]);
      holder[name] = function guardedResolve(host, ...rest) {
        const err = refuse('resolve', String(host));
        if (isPromise) return Promise.reject(err);
        const cb = rest.find((r) => typeof r === 'function'); if (cb) return process.nextTick(cb, err);
        throw err;
      };
    }
  }
  // send(msg, [offset, length,] port [, address] [, cb]): the message is args[0] and is never the address. No address means Node's own
  // loopback default; a non-string, non-function address is refused.
  dgram.Socket.prototype.send = function guardedSend(...args) {
    const rest = args.slice(1);
    const addr = typeof rest[1] === 'number' ? rest[3] : rest[1];
    if (!(addr === undefined || typeof addr === 'function' || (typeof addr === 'string' && isLoopbackHost(addr)))) throw refuse('udp', String(addr));
    return real.send.apply(this, args);
  };
  // connect(port [, address] [, cb]): a connected UDP socket then sends without an address, so the address is checked here.
  dgram.Socket.prototype.connect = function guardedDgramConnect(port, address, ...rest) {
    if (!(address === undefined || typeof address === 'function' || (typeof address === 'string' && isLoopbackHost(address)))) throw refuse('udp-connect', String(address));
    return real.dconnect.call(this, port, address, ...rest);
  };
  globalThis.fetch = function guardedFetch(input, ...rest) {
    let host = '';
    try { host = new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname; } catch { /* refuse below */ }
    if (!host || (!isLoopbackHost(host) && !permitted(host))) return Promise.reject(refuse('fetch', host || String(input)));
    return real.fetch.call(globalThis, input, ...rest);
  };
  active = {
    attempts,
    uninstall() {
      net.Socket.prototype.connect = real.connect; dns.lookup = real.lookup; dns.promises.lookup = real.plookup; globalThis.fetch = real.fetch; dgram.Socket.prototype.send = real.send; dgram.Socket.prototype.connect = real.dconnect;
      for (const [holder, name, orig] of saved) holder[name] = orig;
      active = null;
    },
  };
  return active;
}

// Proves the guard is live: each probe must be refused. Installs a guard for the test if none is installed, and removes it again.
export async function netguardSelfTest() {
  const own = !active; const g = installNetguard(); const before = g.attempts.length;
  const results = [];
  const expectBlocked = async (name, fn) => { try { await fn(); results.push([name, false]); } catch (e) { results.push([name, /netguard: blocked/.test(String(e.message))]); } };
  await expectBlocked('fetch', () => fetch('http://203.0.113.9/'));
  await expectBlocked('socket', () => { net.connect({ host: 'victim.example', port: 80 }).on('error', () => {}); });
  await expectBlocked('socket-by-ip', () => { net.connect({ host: '169.254.169.254', port: 80 }).on('error', () => {}); });
  await expectBlocked('dns-lookup', () => dns.promises.lookup('victim.example'));
  await expectBlocked('dns-resolve', () => dns.promises.resolve4('victim.example'));
  await expectBlocked('udp', () => { const s = dgram.createSocket('udp4'); try { s.send(Buffer.from('x'), 9, '198.51.100.7'); } finally { s.close(); } });
  await expectBlocked('udp-message-looks-like-loopback', () => { const s = dgram.createSocket('udp4'); try { s.send('127.0.0.1', 9, '198.51.100.7'); } finally { s.close(); } });
  await expectBlocked('udp-connect', () => { const s = dgram.createSocket('udp4'); try { s.connect(9, '198.51.100.7'); } finally { s.close(); } });
  const blocked = results.filter(([, ok]) => ok).length;
  const recorded = g.attempts.length - before;
  if (own) g.uninstall();
  return { ok: blocked === results.length && recorded >= results.length, blocked, total: results.length, detail: results.filter(([, ok]) => !ok).map(([n]) => n).join(', ') };
}
