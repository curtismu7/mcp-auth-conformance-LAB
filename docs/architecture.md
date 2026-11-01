# Architecture

```
                 +-------------------+        request({method,url,headers,body})
 scenario / API  |   engine.runScan  |------------------------------+
 ----------------> rules = data      |                              v
                 |   (checks.json)   |             +----------------------------+
                 +---------+---------+             |  client (same interface)   |
                           |                       |  mock-client  | probe      |
                 scorecard + trace envelope        |  (in-process) | (guarded)  |
                                                   +-------+-------+-----+------+
                                                           v             v
                                                     mock.js        one typed URL
                                                  (RS + AS, defects) (loopback by default)
```

- **Rules are data.** `server/data/checks.json` holds id, MUST/SHOULD/MAY, spec references, the quoted clause, why it matters and the fix hint. `engine.js` holds the detectors. `defects.json` says which checks each defect must fail; tests pin it both ways.
- **One client interface.** The engine never knows whether it is talking to the mock (`mock-client.js`, no sockets) or the probe (`probe.js`, real HTTP with guards). Checks that need a token or would write (`dcr_abuse_protection`, `resource_param`, `audience_validation`, `insufficient_scope_403`, the response half of `iss`) run only when `client.active` is true, which only the mock sets.
- **Mock (`mock.js`).** One origin hosting the protected resource and the authorization server: 401 challenge, RFC 9728 metadata, RFC 8414 metadata, `/authorize` (PKCE S256, `resource`, `iss`), `/token`, `/register`, `/mcp` with audience and scope enforcement. Tokens are opaque strings; there are no keys. Two fixtures exist only on the mock (`/_lab/mint`, `/_lab/introspect`) so audience and scope checks can get tokens for other audiences; the probe never calls them. `mock-http.js` mounts the same handler on a loopback listener so probe mode can be shown against it.
- **Discovery order** follows the MCP page: `resource_metadata` from the challenge when same-origin and https, else the path-specific well-known URI, else the root one; authorization server metadata via RFC 8414 then OIDC discovery (with the path-insertion order for issuers that have a path).
- **Trace envelope.** Every request the engine makes becomes a message `{seq, op, label, from, to, traceparent, spanId, at, request, response}` with a W3C `traceparent` (also sent as a header). Text is made inert (control and bidi characters removed, length capped) and `Authorization`/`Cookie` values are redacted.
- **Walkers are iterative.** The WWW-Authenticate parser is a linear scan with hard limits; the engine never recurses over documents (hostile-input tests cover 200k-deep JSON, 1M-character headers and 100k-entry arrays).
- **Health and doctor.** `GET /api/health` is `demo-health/1` from a background self-check; `npm run doctor` adds the full scenario suite across all three verticals and a port check.
- **Reset.** `POST /api/reset` (or `npm run reset`) clears the last scorecard; every scan builds a fresh mock, so there is no other state.

## Web, modes and the diagram

- **Mock | Live toggle.** A header toggle on every page. Mock is the default and sends nothing to the probe. Live turns on the Probe tab only; the other tabs stay on the simulated mock servers and say so. The banner (from `GET /api/catalog`, one text per mode) and the mode chip follow the toggle, in presenter mode too (P / Esc).
- **Diagram.** `server/diagrams/mcp-authorization-flow.json` is diagram-studio/1 data (validated with the studio's own validator copy), served by `GET /api/diagrams/<name>` and loaded by name. A step's `hop` is the HTTP status of that hop. Boxes are movable; Simulate walks the scorecard's real requests, or the data's steps when there is no scorecard; Reset restores the box positions and the simulation.
- **Talk track.** `server/data/talk-track.json` generates `docs/talk-track.md`; a test fails if they drift.
- **Settings.** `server/src/settings.js` reads the shared `~/Development/.env` and takes only `CONFLAB_PROBE_EXTERNAL`.
