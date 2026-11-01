// The conformance engine. Rules are data (data/checks.json); detectors live here. One client interface serves both the
// in-process mock and the read-only probe, so every check has the same evidence trail either way.
import fs from 'node:fs';
import { authorizeAndExchange } from './flow.js';
import { parseChallenges, param } from './wwwauth.js';
import { createTrace, inert } from './trace.js';
import { refs } from './references.js';
import { WELL_KNOWN_PRM, UNRELATED_RESOURCE } from './mock.js';
import { isLoopbackHost } from './safety.js';

export const CHECKS = JSON.parse(fs.readFileSync(new URL('../data/checks.json', import.meta.url), 'utf8'));
export const CHECK_BY_ID = new Map(CHECKS.map((c) => [c.id, c]));
const WEIGHT = { MUST: 3, SHOULD: 2, MAY: 0 };
const CREDIT = { pass: 1, warn: 0.5, fail: 0 };
const SEVERITY = { MUST: 'high', SHOULD: 'medium', MAY: 'low' };
const NO_SUCH_PATH = '/__conformance-lab-no-such-service__';
const MAX_AGE_LIMIT = 86400;

const httpsOrLoopback = (s) => { try { const u = new URL(s); return u.protocol === 'https:' || (u.protocol === 'http:' && isLoopbackHost(u.hostname)); } catch { return false; } };
const parseJson = (body) => { try { const v = JSON.parse(body); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
const maxAge = (cc) => { const m = /(?:^|[\s,])max-age=(\d+)/i.exec(cc || ''); return m ? Number(m[1]) : null; };

export function summarize(checks) {
  let got = 0; let total = 0;
  const counts = { pass: 0, warn: 0, fail: 0, not_tested: 0, info: 0 };
  for (const c of checks) {
    counts[c.status] = (counts[c.status] || 0) + 1;
    const w = WEIGHT[c.level]; if (!w || !(c.status in CREDIT)) continue;
    total += w; got += w * CREDIT[c.status];
  }
  return { score: total ? Math.round((100 * got) / total) : null, counts, failedMust: checks.filter((c) => c.status === 'fail' && c.level === 'MUST').map((c) => c.id) };
}

export async function runScan({ client, clock = () => Date.now(), label } = {}) {
  const trace = createTrace({ clock });
  const results = new Map();
  const set = (id, status, evidence, extra = {}) => results.set(id, { id, status, evidence: [].concat(evidence).map((e) => inert(e, 500)), ...extra });
  const notTested = (id, why) => set(id, 'not_tested', why);

  async function call(lbl, req) {
    const traceparent = trace.nextTraceparent();
    const r = await client.request({ ...req, headers: { traceparent, ...(req.headers || {}) } });
    trace.add({ label: lbl, traceparent, request: req, response: { status: r.status, headers: r.headers, body: r.body, error: r.blocked ? `blocked: ${r.blocked}` : r.error } });
    return r;
  }
  const sameOrigin = (u) => { try { return new URL(u).origin === client.origin; } catch { return false; } };
  const mcpUrl = client.targetUrl;
  const origin = client.origin;

  // ---- 1. The 401 challenge ----
  const first = await call('Unauthenticated MCP request', { method: 'POST', url: mcpUrl, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'conformance-lab', version: '0.1.0' } } }) });
  const reachable = first.status > 0;
  const www = first.headers?.['www-authenticate'];
  let bearer = null;
  if (!reachable) for (const c of CHECKS.filter((x) => x.group === 'challenge')) notTested(c.id, `the target did not answer (${first.blocked || first.error || 'no response'})`);
  else {
    if (first.status === 401 && www) set('challenge_401', 'pass', `HTTP 401 with WWW-Authenticate: ${www}`);
    else if (first.status === 401) set('challenge_401', 'fail', 'HTTP 401 but no WWW-Authenticate header (RFC 6750 section 3 requires one).');
    else set('challenge_401', 'fail', `HTTP ${first.status}: an unauthenticated request was not answered 401.`);
    if (!www) notTested('challenge_shape', 'no WWW-Authenticate header to parse');
    else {
      const parsed = parseChallenges(www);
      bearer = parsed.challenges.find((c) => c.scheme.toLowerCase() === 'bearer') || null;
      const problems = parsed.problems.map((p) => `${p.code}: ${p.message}`);
      if (!bearer) problems.push('no Bearer challenge found');
      else if (!bearer.params.length && !bearer.token68) problems.push('Bearer is not followed by any auth-param (RFC 6750 section 3)');
      if (problems.length) set('challenge_shape', 'fail', problems);
      else set('challenge_shape', 'pass', `Bearer with ${bearer.params.length} auth-param(s): ${bearer.params.map((p) => p.name).join(', ')}`);
    }
    const scope = bearer && param(bearer, 'scope');
    if (!bearer) notTested('challenge_scope', 'no Bearer challenge');
    else if (scope) set('challenge_scope', 'pass', `scope="${scope}"`);
    else set('challenge_scope', 'fail', 'the challenge carries no scope parameter');
  }
  const rm = bearer ? param(bearer, 'resource_metadata') : undefined;

  // ---- 2. Protected resource metadata ----
  let prm = null; let prmFrom = null; const tried = [];
  if (reachable) {
    const resourceUrl = new URL(mcpUrl);
    const wellKnown = [
      { url: `${origin}${WELL_KNOWN_PRM}${resourceUrl.pathname === '/' ? '' : resourceUrl.pathname}`, expect: mcpUrl, via: 'well-known (path-specific)' },
      { url: `${origin}${WELL_KNOWN_PRM}`, expect: origin, via: 'well-known (root)' },
    ];
    const candidates = [];
    if (rm && httpsOrLoopback(rm) && sameOrigin(rm)) candidates.push({ url: rm, expect: mcpUrl, via: 'resource_metadata from the challenge' });
    else if (rm) tried.push(`challenge resource_metadata ${inert(rm, 120)} not fetched (${httpsOrLoopback(rm) ? 'another origin: the lab contacts only the target origin' : 'not https'}); falling back to the well-known URIs`);
    for (const c of wellKnown) if (!candidates.some((x) => x.url === c.url)) candidates.push(c);
    for (const c of candidates) {
      const r = await call(`Fetch protected resource metadata (${c.via})`, { method: 'GET', url: c.url, headers: { accept: 'application/json' } });
      tried.push(`${c.via}: ${c.url} -> ${r.status || r.blocked || r.error}`);
      const doc = r.status === 200 ? parseJson(r.body) : null;
      if (doc) { prm = { doc, expect: c.expect, headers: r.headers, url: c.url }; prmFrom = c.via; break; }
    }
    if (prm) set('prm_present', 'pass', `served by ${prmFrom}: ${prm.url}`);
    else set('prm_present', 'fail', ['no protected resource metadata found', ...tried]);
  } else notTested('prm_present', 'target unreachable');

  if (!prm) { notTested('prm_valid', 'no metadata document'); notTested('prm_path_specificity', 'no metadata document'); }
  else {
    const p = []; const d = prm.doc;
    if (d.resource !== prm.expect) p.push(`resource is ${JSON.stringify(inert(d.resource, 100))}; it must be identical to ${prm.expect} (RFC 9728 section 3.3)`);
    const servers = d.authorization_servers;
    if (!Array.isArray(servers) || !servers.length || !servers.every((s) => typeof s === 'string')) p.push('authorization_servers is missing or empty (MCP requires at least one)');
    else if (!servers.every(httpsOrLoopback)) p.push('an authorization_servers entry is not https');
    if (p.length) set('prm_valid', 'fail', p); else set('prm_valid', 'pass', `resource matches; authorization_servers: ${d.authorization_servers.join(', ')}`);
    const r = await call('Metadata for a path that cannot exist', { method: 'GET', url: `${origin}${WELL_KNOWN_PRM}${NO_SUCH_PATH}`, headers: { accept: 'application/json' } });
    if (r.status === 200 && parseJson(r.body)) set('prm_path_specificity', 'warn', 'a made-up path also returned 200 metadata: this looks like a gateway that answers for any path, so a green metadata check cannot prove the application exists');
    else set('prm_path_specificity', 'pass', `a made-up path answered ${r.status || r.blocked || r.error}`);
  }

  // ---- 3. Authorization server metadata ----
  let as = null; let issuer = origin; let assumed = false; let crossOrigin = null;
  if (reachable) {
    const listed = prm && Array.isArray(prm.doc.authorization_servers) ? prm.doc.authorization_servers.find((s) => typeof s === 'string') : null;
    if (listed) issuer = listed; else assumed = true;
    if (!sameOrigin(issuer)) crossOrigin = issuer;
    else {
      const iu = new URL(issuer); const path = iu.pathname === '/' ? '' : iu.pathname.replace(/\/$/, '');
      const urls = path
        ? [`${iu.origin}/.well-known/oauth-authorization-server${path}`, `${iu.origin}/.well-known/openid-configuration${path}`, `${iu.origin}${path}/.well-known/openid-configuration`]
        : [`${iu.origin}/.well-known/oauth-authorization-server`, `${iu.origin}/.well-known/openid-configuration`];
      const asTried = [];
      for (const url of urls) {
        const r = await call('Fetch authorization server metadata', { method: 'GET', url, headers: { accept: 'application/json' } });
        asTried.push(`${url} -> ${r.status || r.blocked || r.error}`);
        const doc = r.status === 200 ? parseJson(r.body) : null;
        if (doc) { as = { doc, headers: r.headers, url }; break; }
      }
      if (!as) set('as_metadata', 'fail', ['no authorization server metadata found', ...asTried]);
      else {
        const d = as.doc; const p = [];
        if (d.issuer !== issuer) p.push(`issuer ${JSON.stringify(inert(d.issuer, 100))} is not identical to ${issuer} (RFC 8414 section 3.3)`);
        for (const f of ['authorization_endpoint', 'token_endpoint']) if (typeof d[f] !== 'string' || !httpsOrLoopback(d[f])) p.push(`${f} is missing or not https`);
        if (p.length) set('as_metadata', 'fail', p);
        else set('as_metadata', 'pass', [`${as.url}`, `issuer ${issuer}`, ...(assumed ? ['no protected resource metadata, so the lab assumed the authorization server is the target origin'] : [])]);
      }
    }
  }
  const asDown = !reachable ? 'target unreachable' : crossOrigin ? `the authorization server (${inert(crossOrigin, 80)}) is on another origin; the probe contacts only the origin you typed. Probe the authorization server's own URL separately.` : 'no authorization server metadata';
  if (!as) {
    if (!results.has('as_metadata')) notTested('as_metadata', asDown);
    for (const id of ['pkce_s256', 'iss', 'registration_cimd', 'registration_dcr', 'metadata_fresh']) notTested(id, asDown);
  } else {
    const d = as.doc;
    const m = d.code_challenge_methods_supported;
    if (Array.isArray(m) && m.includes('S256')) set('pkce_s256', 'pass', `code_challenge_methods_supported: ${JSON.stringify(m)}`);
    else set('pkce_s256', 'fail', Array.isArray(m) ? `S256 is not listed: ${JSON.stringify(m.slice(0, 5))}` : 'code_challenge_methods_supported is absent, so MCP clients must refuse to proceed');
    set('registration_dcr', 'info', d.registration_endpoint ? `registration_endpoint offered: ${inert(d.registration_endpoint, 120)}` : 'no registration_endpoint: dynamic registration is not offered');
    if (d.client_id_metadata_document_supported === true) set('registration_cimd', 'pass', 'client_id_metadata_document_supported: true');
    else set('registration_cimd', 'fail', 'client_id_metadata_document_supported is not true; clients fall back to DCR or ask the user');
    // freshness
    const f = []; const ages = [prm?.headers?.['cache-control'], as.headers?.['cache-control']].map(maxAge).filter((x) => x !== null);
    if (ages.some((a) => a > MAX_AGE_LIMIT)) f.push(`metadata is cacheable for ${Math.max(...ages)} s (lab limit ${MAX_AGE_LIMIT})`);
    if (typeof d.jwks_uri === 'string' && sameOrigin(d.jwks_uri)) {
      const r = await call('Check the advertised jwks_uri still exists', { method: 'GET', url: d.jwks_uri, headers: { accept: 'application/json' } });
      if (r.status === 404 || r.status === 410) f.push(`jwks_uri answers ${r.status}: the metadata advertises an endpoint that is gone`);
    }
    if (f.length) set('metadata_fresh', 'fail', f); else set('metadata_fresh', 'pass', 'caching is short and the advertised jwks_uri (if any) exists');
  }

  // ---- 4. Active checks (mock only) ----
  const needsActive = { dcr_abuse_protection: 'registers a client on the target', resource_param: 'runs an authorization and token request', audience_validation: 'needs a token for another audience', insufficient_scope_403: 'needs an access token with too little scope', iss: null };
  let issActive = null;
  if (client.active && as) {
    const d = as.doc; const lab = (p) => `${origin}${p}`;
    const readScope = String(scopeOf(bearer) || prm?.doc?.scopes_supported?.[0] || d.scopes_supported?.[0] || 'read').split(' ')[0];
    const mint = async (aud, scope) => { const r = await call('Mock fixture: mint a token', { method: 'POST', url: lab('/_lab/mint'), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aud, scope }) }); return parseJson(r.body)?.access_token; };
    const introspect = async (token) => parseJson((await call('Mock fixture: read the token audience', { method: 'POST', url: lab('/_lab/introspect'), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).body);
    const flow = (resource, scope) => authorizeAndExchange(call, d, { resource, scope });
    // resource + iss
    const good = await flow(mcpUrl, readScope);
    const bad = await flow(UNRELATED_RESOURCE, readScope);
    const aud = good.token?.access_token ? (await introspect(good.token.access_token))?.aud : null;
    const rej = bad.rp.error === 'invalid_target' || bad.token?.error === 'invalid_target';
    const rp = [];
    if (aud !== mcpUrl) rp.push(`the token audience is ${JSON.stringify(inert(aud, 100))}, not the requested resource ${mcpUrl}`);
    if (!rej) rp.push('an unrelated resource was accepted instead of failing with invalid_target');
    if (rp.length) set('resource_param', 'fail', rp); else set('resource_param', 'pass', [`token audience equals the requested resource ${mcpUrl}`, 'an unrelated resource was refused with invalid_target']);
    issActive = good.rp.iss === d.issuer ? 'iss' : (good.rp.iss ? 'wrong' : 'missing');
    // audience + 403
    const readTok = await mint(mcpUrl, readScope); const foreign = await mint(UNRELATED_RESOURCE, readScope);
    const cast = client.mockCast || null; const writeTool = cast?.writeTool || 'write_tool'; const readTool = cast?.readTool || 'read_tool';
    const rpc = (name) => JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: {} } });
    const callMcp = (lbl, tok, name) => call(lbl, { method: 'POST', url: mcpUrl, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: rpc(name) });
    const base = await callMcp('Baseline: a valid read token', readTok, readTool);
    if (base.status !== 200) { notTested('audience_validation', `the baseline call with a valid token answered ${base.status}`); notTested('insufficient_scope_403', `the baseline call with a valid token answered ${base.status}`); }
    else {
      const fr = await callMcp('A token minted for another audience', foreign, readTool);
      if (fr.status === 401) set('audience_validation', 'pass', 'a token for another audience got HTTP 401'); else set('audience_validation', 'fail', `a token for another audience got HTTP ${fr.status}; it must be 401`);
      const wr = await callMcp('Too little scope: call a write tool with a read token', readTok, writeTool);
      const wb = parseChallenges(wr.headers?.['www-authenticate'] || '').challenges.find((c) => c.scheme.toLowerCase() === 'bearer');
      const p = [];
      if (wr.status !== 403) p.push(`HTTP ${wr.status}; insufficient scope must be 403`);
      if (!wb || param(wb, 'error') !== 'insufficient_scope') p.push('the challenge lacks error="insufficient_scope"');
      if (!wb || !param(wb, 'scope')) p.push('the challenge lacks the needed scope');
      if (!wb || !param(wb, 'resource_metadata')) p.push('the challenge lacks resource_metadata');
      if (p.length) set('insufficient_scope_403', 'fail', p); else set('insufficient_scope_403', 'pass', `HTTP 403, ${wr.headers['www-authenticate']}`);
    }
    // DCR abuse
    if (!d.registration_endpoint) notTested('dcr_abuse_protection', 'no registration_endpoint: nothing to test');
    else {
      const reg = (uris) => call('Dynamic registration attempt', { method: 'POST', url: d.registration_endpoint, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'lab-probe', redirect_uris: uris }) });
      const evil = await reg(['http://attacker.example/cb']);
      if (evil.status === 401 || evil.status === 403) set('dcr_abuse_protection', 'pass', `anonymous registration is gated (HTTP ${evil.status})`);
      else {
        const evidence = [`an http redirect URI on another host got HTTP ${evil.status}`]; let throttled = false;
        for (let i = 0; i < 6 && !throttled; i++) throttled = (await reg(['http://127.0.0.1:8123/cb'])).status === 429;
        evidence.push(throttled ? 'repeated registrations were throttled (429)' : 'six registrations in a row were all accepted');
        if ((evil.status >= 200 && evil.status < 300) || !throttled) set('dcr_abuse_protection', 'fail', evidence); else set('dcr_abuse_protection', 'pass', evidence);
      }
    }
  } else if (reachable) {
    for (const [id, why] of Object.entries(needsActive)) if (why) notTested(id, as ? `read-only probe: this check ${why}, which the probe never does` : asDown);
  }
  // iss (combines advertisement with the active response check when available)
  if (as) {
    const adv = as.doc.authorization_response_iss_parameter_supported === true;
    if (!adv) set('iss', 'fail', ['authorization_response_iss_parameter_supported is not true', ...(issActive === 'missing' ? ['the authorization response carried no iss'] : [])]);
    else if (issActive === 'missing') set('iss', 'fail', ['iss is advertised but the authorization response has no iss (RFC 9207 section 2: MUST)']);
    else if (issActive === 'wrong') set('iss', 'fail', ['iss in the authorization response is not the metadata issuer (RFC 9207: MUST be identical)']);
    else set('iss', 'pass', [`authorization_response_iss_parameter_supported: true`, issActive ? 'iss in the authorization response equals the issuer' : 'the authorization response was not exercised (read-only probe)']);
  }
  // challenge_resource_metadata needs the PRM outcome (the well-known fallback is allowed by the MCP page)
  if (reachable) {
    if (rm) {
      if (httpsOrLoopback(rm)) set('challenge_resource_metadata', 'pass', `resource_metadata=${rm}`);
      else set('challenge_resource_metadata', 'fail', `resource_metadata is not https: ${inert(rm, 150)}`);
    } else if (prm) set('challenge_resource_metadata', 'pass', 'no resource_metadata in the challenge, but the well-known URI serves metadata (the MCP page accepts either)');
    else set('challenge_resource_metadata', 'fail', 'no resource_metadata in the challenge and no metadata at the well-known URIs');
  }

  const checks = CHECKS.map((def) => {
    const r = results.get(def.id) || { id: def.id, status: 'not_tested', evidence: ['not reached'] };
    const failing = r.status === 'fail' || r.status === 'warn';
    return {
      id: def.id, group: def.group, title: def.title, level: def.level, mode: def.mode, status: r.status, evidence: r.evidence,
      severity: r.status === 'fail' ? SEVERITY[def.level] : r.status === 'warn' ? 'low' : null,
      clause: def.clause, why: def.why, fix: failing ? def.fix : null, references: refs(def.spec),
    };
  });
  return {
    schema: 'conformance-scorecard/1', label: label || null, target: { kind: client.kind, url: mcpUrl, origin }, ...summarize(checks),
    unverified: checks.filter((c) => c.references.some((r) => !r.verified)).map((c) => c.id),
    checks, trace: trace.envelope(), requests: client.requests?.length ?? 0,
  };
}
function scopeOf(bearer) { return bearer ? param(bearer, 'scope') : undefined; }
