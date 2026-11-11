# mcp-auth-conformance-LAB (catalog D35+D2, Tester tier)

Scores an MCP server's authorization behaviour against the spec expectations (discovery, PKCE, DCR and CIMD, RFC 9728 and 9207 checks) against in-process mock servers with known defects. In Live mode a gated, read-only probe can read one origin the owner types. Everything else is simulated. Node 26 only; Docker on OrbStack only (no SE k8s build, deferred by the owner).

## Run and test
- `./scripts/run.sh` installs, builds, runs the doctor and starts the app on 4901 (UI dev server on 4900). `npm run doctor`, `npm run reset`, `npm run mock` (a loopback mock to probe), `npm run talk-track`, `npm run content-pack`.
- `npm test` runs server, web and `scripts/*.test.mjs`. Use globs, never a directory.
- By hand before a PR: `bash ~/Development/AI-DEMO-Standalone/scripts/check-drift.sh .`, `check-css.sh .`, and `node ~/Development/demo-kit-base/scripts/conformance.mjs . --new` (0 failed; two advisory rule 18 warnings are expected).

## Rules that bite
- Header toggle Mock | Live on every page; Mock is the default. Only the Probe tab is live; the other tabs stay simulated and say so. Banner and mode chip follow the toggle; presenter mode (P / Esc, modifier keys ignored) keeps the banner.
- The probe is read-only, https only (http for loopback), one origin, no credentials, and off for external hosts by default. Never set `CONFLAB_PROBE_EXTERNAL` in Docker (a test pins it); it is exactly `1` or off.
- Settings: only the one shared file `~/Development/.env` (`STANDALONE_ENV` overrides), parsed with `util.parseEnv`, taking only `CONFLAB_PROBE_EXTERNAL`. No per-app `.env` loader, no bare `MODE`.
- The diagram is diagram-studio/1 data (`server/diagrams/`), loaded by name; never hand-build nodes or edges. `server/data/talk-track.json` generates `docs/talk-track.md` (a test fails on drift).
- UI: the shared `web/src/styles/standalone-ui.css` is vendored byte-for-byte and loaded first; app CSS uses tokens only. Run buttons use `aria-disabled`, never `disabled`.
- Netguard: zero outbound by default, with a self-test (incl. udp send and udp connect). The only hole is `permit()` for the one validated probe address.
- Every claim about a spec or a product needs a source, or is labelled UNVERIFIED in `docs/safety.md` or `docs/references.md`.
- Ports 4900-4949 only. Never `crypto.generateKeyPairSync('ec')` or async EC `generateKeyPair`. Only `.example` / `.invalid` hosts (plus the documentation sites we cite). The family history scan must print 0; CI runs it. Never read or embed the list.
- Loopback-only bind, Host check, same-origin writes; Docker publishes `127.0.0.1:` only, as a test pins.
- One writer per repo; PR and merge on green. No AI attribution anywhere (owner, 2026-11-07): no Co-Authored-By trailer and no "Generated with" line in commits, PR bodies or files; CI runs `scripts/check-no-ai-attribution.sh`.
