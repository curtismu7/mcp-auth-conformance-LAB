// Every source the lab cites. verified:true means the page was fetched and the cited text read on 2026-10-21 (docs/references.md
// records what was read). verified:false entries are labelled UNVERIFIED wherever they appear.
const v = (id, label, url, read) => ({ id, label, url, verified: true, read });
const u = (id, label, read) => ({ id, label, url: null, verified: false, read });
export const REFS = [
  v('mcp-auth', 'MCP Authorization (2025-11-25)', 'https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization', 'Whole page: RFC 9728 MUST, discovery order, scope in WWW-Authenticate SHOULD, PKCE and S256, resource parameter MUST (client side), audience validation MUST, 401/403, insufficient_scope 403 SHOULD, CIMD SHOULD, DCR MAY, redirect URIs localhost or https.'),
  v('mcp-auth-draft', 'MCP Authorization (draft)', 'https://modelcontextprotocol.io/specification/draft/basic/authorization', 'Only the standards list was read: it lists RFC 9207 (the 2025-11-25 page does not mention it). A draft can change.'),
  v('rfc9728-3', 'RFC 9728 section 3 (metadata request)', 'https://www.rfc-editor.org/rfc/rfc9728.txt', 'Well-known URI construction and the resource value MUST be identical rule (section 3.3).'),
  v('rfc9728-2', 'RFC 9728 section 2 (metadata parameters)', 'https://www.rfc-editor.org/rfc/rfc9728.txt', 'resource is REQUIRED; authorization_servers is OPTIONAL in the RFC (MCP makes it required).'),
  v('rfc9728-3.3', 'RFC 9728 section 3.3', 'https://www.rfc-editor.org/rfc/rfc9728.txt', 'The returned resource MUST be identical to the resource the metadata was requested for, otherwise the data MUST NOT be used.'),
  v('rfc9728-5.1', 'RFC 9728 section 5.1 (WWW-Authenticate resource_metadata)', 'https://www.rfc-editor.org/rfc/rfc9728.txt', 'The resource_metadata parameter carries the metadata URL and may be combined with other parameters.'),
  v('rfc9728-7.1', 'RFC 9728 section 7.1 (TLS requirements)', 'https://www.rfc-editor.org/rfc/rfc9728.txt', 'Implementations MUST support TLS.'),
  v('rfc8414-3.3', 'RFC 8414 section 3.3 (metadata validation)', 'https://www.rfc-editor.org/rfc/rfc8414.txt', 'The issuer value returned MUST be identical to the authorization server identifier used to build the metadata URL. code_challenge_methods_supported is OPTIONAL in the RFC (MCP requires it).'),
  v('rfc8707-2', 'RFC 8707 section 2 (resource parameter)', 'https://www.rfc-editor.org/rfc/rfc8707.txt', 'The AS SHOULD audience-restrict issued tokens; for an unacceptable resource it should answer invalid_target; it MAY accept a request without resource.'),
  v('rfc9207-2', 'RFC 9207 sections 2 and 2.3 (iss parameter)', 'https://www.rfc-editor.org/rfc/rfc9207.txt', 'A supporting AS MUST include iss in every authorization response (errors too), equal to its issuer, and MUST set authorization_response_iss_parameter_supported to true.'),
  v('rfc7636-4.2', 'RFC 7636 section 4.2 (code_challenge_method)', 'https://www.rfc-editor.org/rfc/rfc7636.txt', 'A client capable of S256 MUST use S256. The RFC does not require a server to advertise methods (that is RFC 8414 plus the MCP page).'),
  v('rfc6750-3', 'RFC 6750 section 3 (WWW-Authenticate)', 'https://www.rfc-editor.org/rfc/rfc6750.txt', 'A resource server MUST include WWW-Authenticate when no valid token is presented; the Bearer scheme MUST be followed by one or more auth-param values.'),
  v('rfc9110-challenge', 'RFC 9110 challenge grammar', 'https://www.rfc-editor.org/rfc/rfc9110.txt', 'Grammar line: challenge = auth-scheme [ 1*SP ( token68 / #auth-param ) ]. Only the grammar line was read.'),
  v('rfc7591-iat', 'RFC 7591 (initial access token)', 'https://www.rfc-editor.org/rfc/rfc7591.txt', 'Definitions section: an initial access token is required when the AS limits the parties that can register; invalid_redirect_uri is a defined error. Rate limiting is not required by the RFC.'),
  v('cimd-00', 'OAuth Client ID Metadata Document, draft 00', 'https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-00.txt', 'Client identifier URLs MUST be https with a path; the document client_id MUST match its URL; the AS SHOULD fetch and SHOULD respect HTTP cache headers. An Internet-Draft: it can change.'),
  v('openai-auth', 'OpenAI Apps SDK: Authentication', 'https://developers.openai.com/apps-sdk/build/auth', 'Whole page: ChatGPT requires PRM, AS metadata, S256 in code_challenge_methods_supported, echoes resource on authorize and token requests, prefers CIMD, supports DCR, uses RFC 9207 iss to pick a stable redirect URI.'),
  u('claude-connectors', 'Claude custom connector requirements', 'The help-center page renders in JavaScript and its text could not be fetched. Nothing about Claude is claimed beyond the generic MCP spec.'),
  u('lab-heuristic', 'Lab heuristic', 'Not a spec requirement. A rule the lab adds for demonstration; labelled UNVERIFIED as a requirement.'),
];
export const REF_BY_ID = new Map(REFS.map((r) => [r.id, r]));
export const refs = (ids) => ids.map((id) => { const r = REF_BY_ID.get(id); if (!r) throw new Error(`unknown reference ${id}`); return { id: r.id, label: r.label, url: r.url, verified: r.verified }; });
