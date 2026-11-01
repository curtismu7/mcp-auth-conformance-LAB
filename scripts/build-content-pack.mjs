// Builds content-pack.json for the Learning Hub from the story and rule data, so the pack cannot drift from the scenarios.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const scenarios = read('server/data/scenarios.json');
const { version } = read('package.json');
// The pack schema allows one catalog id (^[A-Z][0-9]+$), so the pack carries D35; the shelf entry and README carry D35+D2 (one app, two rows).
const { REFS } = await import('../server/src/references.js');

export function buildPack() {
  return {
    schema: 'demo-content-pack/1', id: 'mcp-auth-conformance-lab', title: 'MCP Auth Conformance LAB', version,
    demo: { id: 'mcp-auth-conformance-lab', name: 'MCP Auth Conformance LAB', catalog: 'D35', baseUrl: 'http://localhost:4901', doctor: '/api/health', tags: ['mcp', 'authorization', 'd2', 'conformance', 'rfc-9728', 'pkce', 'cimd', 'mock', 'lab'] },
    glossary: [
      { id: 'prm', term: 'Protected resource metadata (RFC 9728)', definition: 'A JSON document an MCP server publishes that names the server (resource) and the authorization servers that can issue tokens for it. Clients find it from the resource_metadata parameter of the 401 challenge or from a well-known URL.', aliases: ['RFC 9728', 'oauth-protected-resource'] },
      { id: 'www-authenticate', term: 'WWW-Authenticate challenge', definition: 'The header on a 401 or 403 that tells the client how to authenticate: Bearer followed by auth-params such as resource_metadata, scope and error.' },
      { id: 'pkce', term: 'PKCE with S256', definition: 'A one-time secret (code verifier) whose SHA-256 hash is sent with the authorization request, so a stolen authorization code is useless. MCP clients refuse servers whose metadata does not list S256.', aliases: ['RFC 7636'] },
      { id: 'resource-indicator', term: 'Resource indicator (RFC 8707)', definition: 'The resource parameter names the MCP server a token is for. The authorization server copies it into the token audience so the server can reject tokens meant for someone else.', aliases: ['resource parameter', 'RFC 8707'] },
      { id: 'iss', term: 'Issuer identification (RFC 9207)', definition: 'The authorization server adds iss=<its issuer> to every authorization response so the client can tell which server answered and detect mix-up attacks.', aliases: ['RFC 9207', 'iss parameter'] },
      { id: 'cimd', term: 'Client ID Metadata Document (CIMD)', definition: 'A client uses an https URL as its client_id; the URL serves a JSON document describing the client. The MCP page says servers and clients SHOULD support it. It is an Internet-Draft, so it can change.', aliases: ['client id metadata document'] },
      { id: 'dcr', term: 'Dynamic client registration (RFC 7591)', definition: 'A client registers itself at a registration_endpoint and gets a client_id. The MCP page keeps it for backwards compatibility (MAY).', aliases: ['RFC 7591', 'DCR'] },
      { id: 'insufficient-scope', term: 'insufficient_scope (403)', definition: 'The token is valid but lacks a scope. The server answers 403 with error="insufficient_scope" and the scope needed, which lets the client step up instead of failing.', aliases: ['step-up'] },
      { id: 'wildcard-gateway', term: 'Wildcard metadata gateway', definition: 'A gateway that answers protected resource metadata for any path. A probe then proves the gateway is there, not the application behind it.' },
    ],
    sources: REFS.filter((r) => r.url).map((r) => ({ id: r.id, title: r.label, url: r.url, kind: r.id.startsWith('rfc') ? 'standard' : r.id.startsWith('mcp') ? 'spec' : 'reference', use: r.read.slice(0, 200), status: r.verified ? 'verified' : 'not-read', checked: '2026-10-21' })),
    cards: [
      { id: 'try-good', label: 'A server done right', description: 'Score a conforming mock at 100%.', group: 'try-it', action: { type: 'route', href: '/#scenario-S01' }, terms: ['prm', 'pkce'], story: 'S01' },
      { id: 'try-defects', label: 'Break it ten ways', description: 'Each defect fails exactly its own checks.', group: 'try-it', action: { type: 'route', href: '/#scenario-S02' }, terms: ['www-authenticate', 'resource-indicator', 'iss'], story: 'S02' },
      { id: 'try-wildcard', label: 'The wildcard gateway', description: 'Metadata for any path: a warning, not proof.', group: 'try-it', action: { type: 'route', href: '/#scenario-S13' }, terms: ['wildcard-gateway', 'prm'], story: 'S13' },
      { id: 'try-cimd', label: 'DCR versus CIMD', description: 'What each registration path needs.', group: 'try-it', action: { type: 'route', href: '/#scenario-S14' }, terms: ['cimd', 'dcr'], story: 'S14' },
      { id: 'try-stepup', label: 'Step-up after a 403', description: 'insufficient_scope to a second authorization.', group: 'try-it', action: { type: 'route', href: '/#scenario-S15' }, terms: ['insufficient-scope'], story: 'S15' },
      { id: 'concept-clients', label: 'What ChatGPT and Claude need', description: 'A sourced reference; unverified lines are labelled.', group: 'concept', action: { type: 'route', href: '/#clients' }, terms: ['cimd', 'dcr', 'pkce'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    stories: scenarios.map((s) => ({ id: s.id, title: s.title.replace(/\{\{(\w+)\}\}/g, (m, k) => ({ org: 'The server', server: 'An MCP server' })[k] || m), say: s.takeaway })),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`); console.log('wrote content-pack.json'); }
