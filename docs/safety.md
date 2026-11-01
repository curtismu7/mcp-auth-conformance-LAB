# Safety

## Simulated versus real

| | Simulated (in-process mock) | Real |
| --- | --- | --- |
| Targets | `mock.js`: a made-up MCP server and authorization server on `https://mcp.example` | Probe mode: only the one URL you type |
| Network | None. The runtime netguard refuses every non-loopback socket, DNS lookup, resolver call, UDP send and fetch | Probe mode opens one connection to the validated address of that URL |
| Tokens | Opaque strings the mock issues; no keys, no signatures | Never sent: the probe sends no credentials |
| Tenant | None | None |
| What a green score means | The lab's rules behave as written | The target's discovery documents and 401 challenge look right; checks that need a token or would register a client were not run |

Every tab, presenter mode included, shows a banner saying which of these applies. The header has a Mock | Live toggle on every page: Mock (default) is everything in the left column; Live turns on only the Probe tab (the right column), and the banner says so. The toggle is a page-level switch; the gates below apply to every probe however it is sent.

## Live probe (read-only, gated)

- **Gate.** `POST /api/probe` needs `confirm: true` and the exact acknowledgement text from `GET /api/catalog`, otherwise 412.
- **One origin.** The scheme, host and port of the typed URL are locked. Any request to another origin, including a redirect, is refused (`cross_origin`, `cross_origin_redirect`). The engine does not follow an authorization server on another origin; it reports those checks as not tested.
- **https only.** `http` is accepted only for a loopback host the user typed.
- **External targets are off by default.** Without `CONFLAB_PROBE_EXTERNAL=1` (exactly `1`; the host's environment or the one optional key in the shared `~/Development/.env`) only loopback targets are accepted. The Docker image and compose file never set it.
- **SSRF guard.** Every resolved address must be public unicast. Refused: private, link-local, metadata (169.254.0.0/16, fc00::/7), CGNAT, documentation, multicast, IPv4-mapped, NAT64, 6to4 and Teredo ranges; a name that resolves to loopback is refused as DNS rebinding. The connection is pinned to the checked address.
- **Limits.** 10 s timeout, 256 KB response cap, 3 same-origin redirects, 4 KB request body, GET and POST only, no userinfo in the URL.
- **No credentials.** Only `accept`, `content-type`, `traceparent` and a fixed `user-agent` are sent; `Authorization` and `Cookie` are dropped.
- **Read-only.** The probe sends one unauthenticated `initialize` POST to the MCP endpoint and GETs to well-known and metadata URLs. It never calls `/authorize`, `/token` or a registration endpoint.
- **Not for Docker.** Run external probes from the host (`CONFLAB_PROBE_EXTERNAL=1 npm start`), never in the container by default.

A gateway may answer RFC 9728 metadata for any path, so a probe can show the gateway is there, not that the application behind it exists. The lab warns about this (`prm_path_specificity`).

## App hardening

Loopback bind only (`CONFLAB_BIND=1` is the explicit container opt-in, and compose publishes on 127.0.0.1 only); the network guard also refuses UDP send and UDP connect to a non-loopback address; `Host` must be a loopback name; writes need a same-origin `Origin`, JSON content type and no cross-site fetch metadata; CSP `default-src 'self'`; bodies capped at 8 KB; text from targets is made inert and rendered as text only. Only ports 4900-4949 are used. No key generation anywhere in the code. Settings come only from the shared `~/Development/.env` (one optional key; no per-app `.env` loader).

## UNVERIFIED

- Claude's connector requirements (page not retrievable); other clients not researched.
- Which real clients reject an empty first auth-param.
- The lab heuristics: metadata cache limit, made-up-path check, registration throttling.
- MCP spec versions other than 2025-11-25 (a 2026-07-28 release candidate mentioned in the plan was not fetched).
- Any claim that a specific Ping product meets a check.
- The draft MCP page and the CIMD Internet-Draft can change; both are labelled.

See `docs/references.md` for what was read for each source.
