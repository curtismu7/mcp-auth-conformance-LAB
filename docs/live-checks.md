# Live checks (optional, owner only)

Nothing in this repo contacts a real MCP server by default, and the tests prove it (netguard). This page is for the owner who wants to compare the mock with a server they are allowed to test. **It is instructions only: no script in this repo runs any of it, and the agent that built this repo never ran it.** Run it yourself, from your own shell, on the host (never in Docker).

Never paste hostnames, client ids, tokens or tenant details into this repo, its issues or its commit messages.

## Ground rules

- Only test a server you own or have written permission to test.
- The probe is read-only: GET and POST discovery requests plus one unauthenticated `initialize`. It sends no credentials and never calls `/authorize`, `/token` or a registration endpoint.
- It contacts only the one origin you type, https only (http only for loopback), no redirects to other origins, 10 s timeout, 256 KB cap, private and metadata addresses refused.
- A gateway may answer RFC 9728 metadata for any path. A pass proves the gateway, not the application behind it.

## Checks

1. **Baseline on a loopback mock (no external access needed).** In one shell: `node scripts/mock.mjs --defects=no_iss` (prints the mock URL). In the lab, switch the header to Live, open the Probe tab, paste that URL, tick the confirmation and run. Expect the RFC 9207 checks to fail and the rest to match the mock scorecard for S07.
2. **Enable external probing on the host.** Start with `CONFLAB_PROBE_EXTERNAL=1 npm start` (or put that one line in the shared `~/Development/.env`). The doctor prints an info line saying external targets are enabled. Do not set this in `docker-compose.yml` (a test pins that).
3. **Probe one real MCP endpoint you own.** Live mode, Probe tab, type its https URL, confirm, run. Compare each result with `curl -si https://<your-host>/<mcp-path>` (expect a 401 with `WWW-Authenticate`) and `curl -s https://<your-host>/.well-known/oauth-protected-resource<mcp-path>` yourself.
4. **Read the "not tested" rows.** Token checks (resource parameter, audience, 403 `insufficient_scope`, DCR throttling) are excluded in probe mode on purpose. Test them with your own client and note the result separately.
5. **Compare with a real client.** Try connecting the same URL from ChatGPT or Claude. UNVERIFIED: what each requires beyond the generic MCP spec; record what you saw in your own notes.

## Not covered here

- Anything that registers a client, obtains a token or calls a tool.
- Scoring against MCP spec versions other than 2025-11-25.

## Recording results

Write a few lines in your own notes (not this repo): date, target type (not its name), which checks matched the mock, which differed. If a difference changes what an SE should say, update `docs/talk-track.md` and the UNVERIFIED list in `docs/safety.md` in a normal commit that names no target.

## After you are done

Stop the server, unset `CONFLAB_PROBE_EXTERNAL`, press Reset (or `npm run reset`), and delete any captured output. Do not commit it.
