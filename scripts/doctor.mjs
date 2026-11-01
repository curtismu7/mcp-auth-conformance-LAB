#!/usr/bin/env node
// Preflight: the same checks GET /api/health is built from, plus the scenario suite, the talk-track file, and whether the port is free.
// Prints only pass/fail lines, never a setting's value. Exit 1 on any failure. Needs no network.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(path.join(root, p)));
const { installNetguard } = await load('server/src/netguard.js');
installNetguard();
const { applySharedSettings } = await load('server/src/settings.js');
applySharedSettings(); // the one shared settings file; takes only this lab's own key
const { runChecks } = await load('server/src/doctor.js');
const { resolveBind } = await load('server/src/safety.js');
const { renderTalkTrackMarkdown } = await load('server/src/talkTrack.js');
let failed = 0;
const report = (level, name, detail) => { if (level === 'fail') failed++; console.log(`${level.toUpperCase().padEnd(4)}  ${name}: ${detail}`); };
for (const c of await runChecks()) report(c.level, c.id, c.detail);
try {
  const same = fs.readFileSync(path.join(root, 'docs/talk-track.md'), 'utf8') === renderTalkTrackMarkdown();
  report(same ? 'pass' : 'fail', 'talk-track-file', same ? 'docs/talk-track.md matches the data' : 'docs/talk-track.md differs from server/data/talk-track.json: run npm run talk-track');
} catch { report('fail', 'talk-track-file', 'docs/talk-track.md is missing: run npm run talk-track'); }
let bind; try { bind = resolveBind(); } catch { /* already reported */ }
if (bind) {
  await new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (e) => { report('fail', 'port-free', `${bind.port} is not free (${e.code}): something already holds the app port (another copy of the lab, or another program). Set CONFLAB_PORT to a free port in 4900-4949`); resolve(); });
    s.listen(bind.port, '127.0.0.1', () => s.close(() => { report('pass', 'port-free', `${bind.port} is free`); resolve(); }));
  });
}
process.exit(failed ? 1 : 0);
