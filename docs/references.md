# References: what was fetched and read

Rule for this repo: a spec section or product behaviour is cited only if the page was fetched and read in the session that built it (step 0, 2026-10-21). Anything else is labelled UNVERIFIED in the UI and the docs. `server/src/references.js` is the data; this file is the human record and a test checks every id and URL appears here.

| Id | Source | Flag | What was read | URL |
| --- | --- | --- | --- | --- |
| `mcp-auth` | MCP Authorization (2025-11-25) | verified | Whole page: RFC 9728 MUST, discovery order, scope in WWW-Authenticate SHOULD, PKCE and S256, resource parameter MUST (client side), audience validation MUST, 401/403, insufficient_scope 403 SHOULD, CIMD SHOULD, DCR MAY, redirect URIs localhost or https. | https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization |
| `mcp-auth-draft` | MCP Authorization (draft) | verified | Only the standards list was read: it lists RFC 9207 (the 2025-11-25 page does not mention it). A draft can change. | https://modelcontextprotocol.io/specification/draft/basic/authorization |
| `rfc9728-3` | RFC 9728 section 3 (metadata request) | verified | Well-known URI construction and the resource value MUST be identical rule (section 3.3). | https://www.rfc-editor.org/rfc/rfc9728.txt |
| `rfc9728-2` | RFC 9728 section 2 (metadata parameters) | verified | resource is REQUIRED; authorization_servers is OPTIONAL in the RFC (MCP makes it required). | https://www.rfc-editor.org/rfc/rfc9728.txt |
| `rfc9728-3.3` | RFC 9728 section 3.3 | verified | The returned resource MUST be identical to the resource the metadata was requested for, otherwise the data MUST NOT be used. | https://www.rfc-editor.org/rfc/rfc9728.txt |
| `rfc9728-5.1` | RFC 9728 section 5.1 (WWW-Authenticate resource_metadata) | verified | The resource_metadata parameter carries the metadata URL and may be combined with other parameters. | https://www.rfc-editor.org/rfc/rfc9728.txt |
| `rfc9728-7.1` | RFC 9728 section 7.1 (TLS requirements) | verified | Implementations MUST support TLS. | https://www.rfc-editor.org/rfc/rfc9728.txt |
| `rfc8414-3.3` | RFC 8414 section 3.3 (metadata validation) | verified | The issuer value returned MUST be identical to the authorization server identifier used to build the metadata URL. code_challenge_methods_supported is OPTIONAL in the RFC (MCP requires it). | https://www.rfc-editor.org/rfc/rfc8414.txt |
| `rfc8707-2` | RFC 8707 section 2 (resource parameter) | verified | The AS SHOULD audience-restrict issued tokens; for an unacceptable resource it should answer invalid_target; it MAY accept a request without resource. | https://www.rfc-editor.org/rfc/rfc8707.txt |
| `rfc9207-2` | RFC 9207 sections 2 and 2.3 (iss parameter) | verified | A supporting AS MUST include iss in every authorization response (errors too), equal to its issuer, and MUST set authorization_response_iss_parameter_supported to true. | https://www.rfc-editor.org/rfc/rfc9207.txt |
| `rfc7636-4.2` | RFC 7636 section 4.2 (code_challenge_method) | verified | A client capable of S256 MUST use S256. The RFC does not require a server to advertise methods (that is RFC 8414 plus the MCP page). | https://www.rfc-editor.org/rfc/rfc7636.txt |
| `rfc6750-3` | RFC 6750 section 3 (WWW-Authenticate) | verified | A resource server MUST include WWW-Authenticate when no valid token is presented; the Bearer scheme MUST be followed by one or more auth-param values. | https://www.rfc-editor.org/rfc/rfc6750.txt |
| `rfc9110-challenge` | RFC 9110 challenge grammar | verified | Grammar line: challenge = auth-scheme [ 1*SP ( token68 / #auth-param ) ]. Only the grammar line was read. | https://www.rfc-editor.org/rfc/rfc9110.txt |
| `rfc7591-iat` | RFC 7591 (initial access token) | verified | Definitions section: an initial access token is required when the AS limits the parties that can register; invalid_redirect_uri is a defined error. Rate limiting is not required by the RFC. | https://www.rfc-editor.org/rfc/rfc7591.txt |
| `cimd-00` | OAuth Client ID Metadata Document, draft 00 | verified | Client identifier URLs MUST be https with a path; the document client_id MUST match its URL; the AS SHOULD fetch and SHOULD respect HTTP cache headers. An Internet-Draft: it can change. | https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-00.txt |
| `openai-auth` | OpenAI Apps SDK: Authentication | verified | Whole page: ChatGPT requires PRM, AS metadata, S256 in code_challenge_methods_supported, echoes resource on authorize and token requests, prefers CIMD, supports DCR, uses RFC 9207 iss to pick a stable redirect URI. | https://developers.openai.com/apps-sdk/build/auth |
| `claude-connectors` | Claude custom connector requirements | UNVERIFIED | The help-center page renders in JavaScript and its text could not be fetched. Nothing about Claude is claimed beyond the generic MCP spec. | none |
| `lab-heuristic` | Lab heuristic | UNVERIFIED | Not a spec requirement. A rule the lab adds for demonstration; labelled UNVERIFIED as a requirement. | none |

## How the sources were read

- The MCP authorization page, the draft page and the OpenAI page were fetched as HTML, stripped to text and read for the passages cited above. The RFCs were fetched as plain text from rfc-editor.org and the cited sections were read directly, not through a summary.
- RFC 6750 section 3 and the RFC 9110 challenge grammar line were read to ground the WWW-Authenticate check. Only that grammar line of RFC 9110 was read.
- The CIMD draft text was fetched; the lab relies on the MCP page's own summary of it and on the three lines read (https client_id with a path, document client_id must match its URL, AS SHOULD respect cache headers). It is an Internet-Draft and can change.

## UNVERIFIED (labelled as such in the UI)

- **Claude's connector requirements.** The Claude help-center page renders in JavaScript; its text could not be fetched. The lab claims nothing specific about Claude and says so.
- **Other clients** (LibreChat, LM Studio, IDE hosts): not researched.
- **Which real clients choke on an empty first auth-param** in WWW-Authenticate: not tested against any client.
- **Lab heuristics**, which are not spec requirements: the metadata cache limit (86400 s), the check that a made-up path must not return metadata, and registration throttling.
- **MCP spec versions other than 2025-11-25.** The plan row mentions a 2026-07-28 release candidate claimed by a repo doc; it was not fetched and the lab does not score against it. The draft page was read only for its standards list (it includes RFC 9207).
- **Whether any Ping product** meets any of these checks. The lab makes no product claim.

## Seeds read (read-only, never imported)

Style and structure only: `attack-gallery` (references format, SSRF guard style), `intent-par-inspector` (stories as data, netguard, safety), `ping-gateway-route-lab` (WWW-Authenticate linter approach, re-implemented here), `agent-registry-demo` (CI workflow), `demo-shelf` (health contract). Nothing was copied across: every module in this repo was written here.

## Scope boundaries

This lab scores authorization. `mcp-tools` scores tool definitions (poisoning), `hostile-mcp` is a hostile server, `attack-gallery` runs multi-step attacks, `ping-gateway-route-lab` lints the route and header inside a gateway, `pingone-mcp-inspector` is PingOne's hosted MCP. None is rebuilt here.
