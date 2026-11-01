// In-process mock MCP server + authorization server, one origin, with selectable defects (data/defects.json).
// Pure: handle({ method, url, headers, body }) -> { status, headers, body }. No sockets, no keys, no clock. Tokens are opaque strings.
// The same handler is mounted on a loopback HTTP listener by mock-http.js so probe mode can be demonstrated against a local mock.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
export const DEFECTS = load('defects.json');
export const VERTICALS = load('verticals.json');
export const DEFECT_IDS = DEFECTS.map((d) => d.id);
export const getVertical = (id) => VERTICALS.find((v) => v.id === id);
export const MOCK_ORIGIN = 'https://mcp.example';
export const UNRELATED_RESOURCE = 'https://unrelated.example/mcp';
export const WELL_KNOWN_PRM = '/.well-known/oauth-protected-resource';

const json = (status, obj, headers = {}) => ({ status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }, body: JSON.stringify(obj) });
const b64url = (buf) => buf.toString('base64url');
const isLoop = (h) => h === 'localhost' || h === '[::1]' || /^127(\.\d{1,3}){3}$/.test(h);

export function createMock({ defects = [], vertical = 'banking', origin = MOCK_ORIGIN } = {}) {
  for (const d of defects) if (!DEFECT_IDS.includes(d)) throw new Error(`unknown defect: ${d}`);
  const cast = (getVertical(vertical) || getVertical('banking')).cast;
  const has = (d) => defects.includes(d);
  const resource = `${origin}/mcp`;
  const prmPath = `${WELL_KNOWN_PRM}/mcp`;
  const state = { codes: new Map(), tokens: new Map(), registrations: 0, n: 0 };
  const known = new Set([resource, origin]);
  const id = (p) => `${p}_${(state.n += 1).toString(36)}${b64url(randomBytes(6))}`;
  const asIssuer = has('as_issuer_mismatch') ? `${origin}/` : origin;
  const metaCache = has('metadata_stale') ? 'public, max-age=31536000' : 'public, max-age=300';

  const prmUrl = () => {
    const u = new URL(origin + prmPath);
    if (has('http_metadata_url')) { u.protocol = 'http:'; if (isLoop(u.hostname) || u.hostname.startsWith('[')) u.host = 'metadata.example'; }
    return u.href;
  };
  const challenge = (extra) => {
    const parts = [`resource_metadata="${prmUrl()}"`, ...extra];
    return `Bearer ${has('bad_www_authenticate') ? ', ' : ''}${parts.join(', ')}`;
  };

  function prmDoc(res) {
    return { resource: has('prm_resource_mismatch') ? 'https://other.example/mcp' : res, authorization_servers: [origin], scopes_supported: [cast.readScope, cast.writeScope], bearer_methods_supported: ['header'], resource_name: cast.server };
  }
  function asDoc() {
    const d = {
      issuer: asIssuer, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, jwks_uri: has('metadata_stale') ? `${origin}/keys/retired.json` : `${origin}/jwks.json`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code'], token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [cast.readScope, cast.writeScope],
      code_challenge_methods_supported: has('no_pkce_s256') ? ['plain'] : ['S256'],
    };
    if (!has('dcr_absent')) d.registration_endpoint = `${origin}/register`;
    if (!has('cimd_unsupported')) d.client_id_metadata_document_supported = true;
    if (!has('no_iss')) d.authorization_response_iss_parameter_supported = true;
    return d;
  }

  function parseBody(req) {
    const ct = String(req.headers['content-type'] || '');
    const raw = req.body || '';
    if (/json/i.test(ct)) { try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
    return Object.fromEntries(new URLSearchParams(raw));
  }

  function authorize(u) {
    const q = u.searchParams;
    const redirect = q.get('redirect_uri') || '';
    let ru; try { ru = new URL(redirect); } catch { return json(400, { error: 'invalid_request', error_description: 'redirect_uri missing or not absolute' }); }
    if (!(ru.protocol === 'https:' || (ru.protocol === 'http:' && isLoop(ru.hostname)))) return json(400, { error: 'invalid_request', error_description: 'redirect_uri must be https or loopback' });
    const respond = (params) => {
      if (!has('no_iss')) params.iss = asIssuer;
      for (const [k, v] of Object.entries(params)) if (v !== undefined) ru.searchParams.set(k, v);
      return { status: 302, headers: { location: ru.href, 'cache-control': 'no-store' }, body: '' };
    };
    const state_ = q.get('state') || undefined;
    if (q.get('response_type') !== 'code') return respond({ error: 'unsupported_response_type', state: state_ });
    if (!q.get('code_challenge') || q.get('code_challenge_method') !== 'S256') return respond({ error: 'invalid_request', error_description: 'PKCE S256 required', state: state_ });
    const res = q.get('resource');
    if (res && !known.has(res) && !has('resource_ignored')) return respond({ error: 'invalid_target', state: state_ });
    const code = id('code');
    state.codes.set(code, { resource: res || resource, scope: q.get('scope') || cast.readScope, challenge: q.get('code_challenge'), redirect });
    return respond({ code, state: state_ });
  }

  function token(req) {
    const b = parseBody(req);
    const c = state.codes.get(b.code);
    if (b.grant_type !== 'authorization_code' || !c) return json(400, { error: 'invalid_grant' });
    state.codes.delete(b.code);
    if (!b.code_verifier || b64url(createHash('sha256').update(String(b.code_verifier)).digest()) !== c.challenge) return json(400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
    if (b.resource && !known.has(b.resource) && !has('resource_ignored')) return json(400, { error: 'invalid_target' });
    const aud = has('resource_ignored') ? `${origin}/` : (b.resource || c.resource);
    const t = id('at');
    state.tokens.set(t, { aud, scope: c.scope });
    return json(200, { access_token: t, token_type: 'Bearer', expires_in: 3600, scope: c.scope });
  }

  function register(req) {
    if (has('dcr_absent')) return json(404, { error: 'not_found' });
    const b = parseBody(req);
    const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
    if (!has('dcr_open')) {
      if (!uris.length || !uris.every((x) => { try { const p = new URL(x); return p.protocol === 'https:' || (p.protocol === 'http:' && isLoop(p.hostname)); } catch { return false; } })) return json(400, { error: 'invalid_redirect_uri' });
      if (state.registrations >= 5) return json(429, { error: 'too_many_requests' }, { 'retry-after': '60' });
    }
    state.registrations += 1;
    return json(201, { client_id: id('client'), redirect_uris: uris, client_name: String(b.client_name || '').slice(0, 80) });
  }

  function mcp(req) {
    const auth = String(req.headers.authorization || '');
    const m = /^Bearer\s+(\S+)$/i.exec(auth);
    if (!m && has('open_server')) return json(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'open' }] } });
    if (!m) return json(401, { error: 'unauthorized' }, { 'www-authenticate': challenge(has('no_scope_hint') ? [] : [`scope="${cast.readScope}"`]) });
    const t = state.tokens.get(m[1]);
    if (!t) return json(401, { error: 'invalid_token' }, { 'www-authenticate': challenge(['error="invalid_token"']) });
    if (!has('audience_unchecked') && t.aud !== resource) return json(401, { error: 'invalid_token', error_description: 'wrong audience' }, { 'www-authenticate': challenge(['error="invalid_token"', 'error_description="wrong audience"']) });
    const rpc = (() => { try { return JSON.parse(req.body || '{}'); } catch { return {}; } })();
    const have = new Set(String(t.scope).split(' '));
    const needs = rpc.method === 'tools/call' ? (rpc.params?.name === cast.writeTool ? cast.writeScope : cast.readScope) : null;
    if (needs && !have.has(needs)) {
      const wanted = [...have, needs].join(' ');
      if (has('wrong_403')) return json(403, { error: 'forbidden' }, { 'www-authenticate': 'Bearer realm="mcp"' });
      return json(403, { error: 'insufficient_scope' }, { 'www-authenticate': challenge(['error="insufficient_scope"', `scope="${wanted}"`]) });
    }
    return json(200, { jsonrpc: '2.0', id: rpc.id ?? null, result: { content: [{ type: 'text', text: `${rpc.method || 'request'} accepted` }] } });
  }

  function handle(req) {
    let u; try { u = new URL(req.url); } catch { return json(400, { error: 'bad_url' }); }
    const p = u.pathname; const method = String(req.method || 'GET').toUpperCase();
    // Metadata (always GET).
    if (p.startsWith(WELL_KNOWN_PRM) && method === 'GET') {
      if (has('missing_prm')) return json(404, { error: 'not_found' });
      const cc = { 'cache-control': metaCache };
      if (p === prmPath) return json(200, prmDoc(resource), cc);
      if (has('wildcard_gateway') && p.length > WELL_KNOWN_PRM.length) return json(200, prmDoc(origin + p.slice(WELL_KNOWN_PRM.length)), cc);
      return json(404, { error: 'not_found' });
    }
    if ((p === '/.well-known/oauth-authorization-server' || p === '/.well-known/openid-configuration') && method === 'GET') return json(200, asDoc(), { 'cache-control': metaCache });
    if (p === '/jwks.json' && method === 'GET') return json(200, { keys: [] });
    if (p === '/mcp' && method === 'POST') return mcp(req);
    if (p === '/authorize' && method === 'GET') return authorize(u);
    if (p === '/token' && method === 'POST') return token(req);
    if (p === '/register' && method === 'POST') return register(req);
    // Mock-only fixtures. Real servers have nothing like these; probe mode never calls them.
    if (p === '/_lab/mint' && method === 'POST') { const b = parseBody(req); const t = id('at'); state.tokens.set(t, { aud: String(b.aud || resource), scope: String(b.scope || cast.readScope) }); return json(200, { access_token: t }); }
    if (p === '/_lab/introspect' && method === 'POST') { const t = state.tokens.get(parseBody(req).token); return json(200, t ? { active: true, aud: t.aud, scope: t.scope } : { active: false }); }
    return json(404, { error: 'not_found' });
  }

  return { origin, resource, prmPath, cast, defects: [...defects], handle, reset() { state.codes.clear(); state.tokens.clear(); state.registrations = 0; state.n = 0; } };
}
