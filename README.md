# MCP Auth Conformance LAB

Point it at an MCP server and get a **scorecard**: does it follow the MCP authorization expectations? Each check says what was seen (evidence), whether the rule is a MUST or a SHOULD, how severe a failure is, how to fix it, and which spec clause it comes from. A second part is a **sourced reference of what ChatGPT and other MCP clients need** to connect (discovery, DCR or CIMD, PKCE), with every line marked verified or UNVERIFIED.

Tier: Tester
Repo: https://github.com/ping-sandbox/mcp-auth-conformance-LAB
Catalog: D35+D2

Catalog ids D35 (MCP authorization conformance scorecard) and D2 (MCP auth lab) are carried over from the earlier repo, which built them as one app. They come from the family board, not from a catalog table checked in this repo; treat them as carried over until the owner confirms them. The Learning Hub pack schema takes a single id, so `content-pack.json` carries `D35`.

## What is simulated

**Mock mode (default).** Everything runs offline in one process. The targets are in-process mock MCP servers with selectable defects (the good server, and 17 ways to break it). There is no tenant, no real authorization server and no outbound network. Tokens are opaque strings the mock issues. The banner on every tab, presenter mode included, says so.

**Live mode (owner-run).** Only the **Probe** tab goes live: it scores one URL you type with read-only discovery requests (GET and POST discovery, one unauthenticated `initialize`; no credentials; one origin; https, or http for loopback; private and metadata addresses refused). By default it reaches loopback targets only. The host owner can allow one https target at a time by setting `CONFLAB_PROBE_EXTERNAL=1` (see Settings file); Docker never does. Scorecard, Stories, Clients and Diagram keep using the simulated mock servers in Live mode, and each says so. A "pass" against a probe proves the discovery documents and the 401 challenge look right; checks that need a token or would register a client are not run (they show NOT TESTED). See `docs/safety.md`.

## Run from a clone

Prerequisites: Node 26 or newer. Docker only if you use the Docker form.

```
git clone https://github.com/ping-sandbox/mcp-auth-conformance-LAB.git
cd mcp-auth-conformance-LAB
npm ci
npm run build
npm start
```

Open http://127.0.0.1:4901/ . Or in one step: `./scripts/run.sh` (installs and builds if needed, runs the doctor, starts). Mock mode works with no setup at all: no tenant, no credentials, no settings file. Build before you start: the server looks for `web/dist` once, at startup.

Try it without a UI:

```
curl -s -X POST http://127.0.0.1:4901/api/scan -H 'content-type: application/json' -H 'origin: http://127.0.0.1:4901' \
  -d '{"defects":["no_pkce_s256"],"vertical":"banking"}'
```

To try the Live probe against something safe, serve a mock on loopback and probe it (the probe asks for a confirmation text; see `GET /api/catalog`, `probe.ack`):

```
node scripts/mock.mjs --defects=no_iss      # prints the mock URL, e.g. http://127.0.0.1:4930/mcp
```

What it checks (rules are data in `server/data/checks.json`, 17 checks): the 401 challenge, protected resource metadata (RFC 9728), authorization server metadata (RFC 8414 / OIDC), PKCE S256, RFC 9207 `iss`, CIMD and DCR, and, on the mock only, the `resource` parameter (RFC 8707), audience validation and 403 `insufficient_scope`. Scoring: MUST counts 3, SHOULD 2, MAY 0; a warning is half credit; checks that were not tested are excluded, not guessed. Of the 17 defects, `wildcard_gateway` (a warning) and `dcr_absent` (informational) fail no check. Stories are data in `server/data/scenarios.json`, with three vertical packs (banking, travel, retail) that fill the `{{cast}}` tokens.

## Settings file

All standalone apps read one settings file, `~/Development/.env`, which must be mode 600. `STANDALONE_ENV` overrides its path. This lab needs none of it. It parses the file (`util.parseEnv`) and takes exactly one optional key; no other key from the file ever enters the server's environment, and there is no per-app `.env` loader:

- `CONFLAB_PROBE_EXTERNAL` (optional): `1` lets the Live probe reach the one https URL you type. Anything else, or absent, keeps it loopback-only. Host only; never set it for Docker (a test pins that).

The shared file holds no `PORT`: the lab keeps its port default in code. No admin or worker credentials are used here. The doctor reports whether the file exists and its mode, and never prints a value.

## Ports, and what to do if the port is taken

```
Ports: mcp-auth-conformance-LAB listens on 4901 (set with CONFLAB_PORT, default 4901).
Port range for this app: 4900-4949.

If the port is taken:
1. Find what is using it:
   lsof -iTCP:4901 -sTCP:LISTEN -n -P
2. If it is an old copy of this app, stop that process: kill <PID>.
3. If it is something else, stop it, or start this app on another port:
   CONFLAB_PORT=<other port> npm start
4. Do not use 8080, 5173, 3000, 4000, 4400, 4510, 4600-4601, 18080, 19080 or 19090.
```

Other variables: `VITE_PORT` (Vite dev server, default 4900, `npm run dev -w web`), `HOST_PORT` (Docker host port, default 4901). Mock listeners and tests use 4902-4949. Keep all of them inside 4900-4949.

## Mock and live modes

The header has a **Mock | Live** toggle on every page, and the banner and the mode chip show the same mode. The choice is remembered in this browser. Mock is the default. In Mock mode the Probe tab says so and sends nothing. Live turns the Probe tab on; the other tabs stay simulated and show a note. The toggle is a page-level switch: the server's own gates (the confirmation text, loopback-only unless the host owner enabled external probing, the netguard) apply to every probe however it is sent. Presenter mode: press `P` (Esc leaves; keys with Ctrl, Cmd or Alt held, and typing in a field, are ignored); the banner stays.

## Health, doctor and reset

```
npm run doctor   # Node, bind, story hosts, rules data, diagram, talk track, netguard (incl. udp connect), every scenario in every vertical, port free
npm run reset    # forgets the last scorecard of the running lab; the UI Reset also puts the diagram boxes back
```

The app answers `GET /api/health` with `demo-health/1`. `npm run talk-track` regenerates `docs/talk-track.md` from `server/data/talk-track.json` (a test fails if they differ), and `npm run content-pack` rebuilds and validates `content-pack.json`. The diagram is diagram-studio/1 data in `server/diagrams/`, loaded by name from `GET /api/diagrams/<name>`.

## Docker (optional)

```
docker compose up --build -d
```

Open http://127.0.0.1:4901/ . The container publishes to 127.0.0.1 only (a test pins it), runs as a non-root user with a read-only file system and no capabilities. Use OrbStack, not Docker Desktop. In the container the Live probe can only reach loopback. Run external probes from the host (`docs/live-checks.md`).

## Tests

```
npm test    # server (node --test), web (vitest, drives the UI against the real server), scripts
```

The shared checks are run by hand, because they are not shipped into this repo's CI: `bash <AI-DEMO-Standalone>/scripts/check-drift.sh .`, `bash <AI-DEMO-Standalone>/scripts/check-css.sh .` and `node <demo-kit-base>/scripts/conformance.mjs . --new`. Conformance reports two advisory rule 18 warnings on purpose (the SE k8s build is deferred).

On Node 26: 156 tests pass (85 server, 51 web, 20 scripts). The browser logs the deliberate 4xx answers (a refused probe, a rejected body) as console messages; they are expected.

## Troubleshooting

- **The page says "Cannot GET /".** The server looks for `web/dist` once, at startup. Run `npm run build`, then restart.
- **Port is taken.** See "Ports, and what to do if the port is taken" above.
- **The Probe tab will not send.** Check the header says Live, tick the confirmation, and use a loopback URL (or ask the host owner to set `CONFLAB_PROBE_EXTERNAL=1` on the host).
- **`npm run doctor` fails on `talk-track-file`.** Run `npm run talk-track`; the doc is generated from the data.
- **Docker is not running.** Start OrbStack (`open -a OrbStack`), then `docker compose up --build -d`.

## Ownership

- Owner: the Ping demo family owner (see the standalone rulebook).
- License: MIT (`LICENSE`).
- Found a problem? Open an issue on the repo.
