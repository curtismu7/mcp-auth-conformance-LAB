// Authorization-code + PKCE flow against a mock authorization server, driven through the engine's traced `call`.
// The redirect URI is a loopback URL that is never contacted: the Location header is read, not followed.
import { createHash, randomBytes } from 'node:crypto';

const parse = (b) => { try { const v = JSON.parse(b); return v && typeof v === 'object' ? v : null; } catch { return null; } };

// -> { rp: { code?, state?, iss?, error? }, token: {...}|null, tokenStatus? }
export async function authorizeAndExchange(call, as, { resource, scope, label = 'Authorization request' }) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = 'http://127.0.0.1:8123/callback';
  const q = new URLSearchParams({ response_type: 'code', client_id: 'lab-client', redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: randomBytes(6).toString('hex'), scope, resource });
  const a = await call(`${label} (resource, S256)`, { method: 'GET', url: `${as.authorization_endpoint}?${q}` });
  const rp = a.headers?.location ? Object.fromEntries(new URL(a.headers.location).searchParams) : {};
  if (!rp.code) return { rp, token: null };
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: rp.code, code_verifier: verifier, redirect_uri: redirect, client_id: 'lab-client', resource }).toString();
  const t = await call('Token request (resource)', { method: 'POST', url: as.token_endpoint, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  return { rp, token: parse(t.body), tokenStatus: t.status };
}
