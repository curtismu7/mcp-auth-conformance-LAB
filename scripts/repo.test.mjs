import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const text = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('CI is GitHub-hosted, Node 26 only; it runs the tests, the build, the doctor, gitleaks and the forbidden-strings gate (the list itself is never in the repo)', () => {
  const ci = text('.github/workflows/ci.yml');
  for (const needle of ['npm ci', 'npm test', 'npm run build', 'npm run doctor', 'gitleaks detect', 'forbidden-strings', 'validate-content-pack']) assert.ok(ci.includes(needle), needle);
  assert.match(ci, /runs-on: ubuntu-latest/);
  assert.ok(!/self-hosted/.test(ci), 'no self-hosted runner');
  const versions = [...ci.matchAll(/node-version: (\S+)/g)].map((m) => m[1]);
  assert.ok(versions.length >= 3 && versions.every((v) => v === '26'), versions.join());
  assert.match(ci, /actions\/checkout@v5/); assert.match(ci, /actions\/setup-node@v5/);
  assert.match(ci, /grep -cF -f/);
  assert.match(ci, /CONFLAB_PORT=49\d\d npm run doctor/);
});

test('Node 26 everywhere: engines in all three package.json files, .nvmrc, and both Dockerfile stages', () => {
  for (const f of ['package.json', 'server/package.json', 'web/package.json']) assert.equal(JSON.parse(text(f)).engines.node, '>=26', f);
  assert.equal(text('.nvmrc').trim(), '26');
  const stages = [...text('Dockerfile').matchAll(/^FROM (\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(stages, ['node:26-alpine', 'node:26-alpine']);
});

test('no k8s manifests, no MODE switch, no per-app .env loader, and the only env keys the shared file may set are this lab\'s own', () => {
  assert.ok(!fs.existsSync(new URL('../k8s', import.meta.url)) && !fs.existsSync(new URL('../deploy', import.meta.url)));
  for (const f of ['server/src/index.js', 'server/src/app.js', 'server/src/safety.js', 'scripts/doctor.mjs', 'scripts/reset.mjs', 'Dockerfile', 'docker-compose.yml']) {
    const t = text(f);
    assert.ok(!/process\.env\.MODE\b|\bMODE=/.test(t), `${f}: no MODE switch`);
    assert.ok(!/loadEnvFile|dotenv/.test(t), `${f}: no per-app .env loader`);
  }
  assert.match(text('.gitignore'), /^\.env$/m);
});

test('the shared stylesheet is vendored and loaded first; the repo has no second copy of it', () => {
  assert.ok(fs.existsSync(new URL('../web/src/styles/standalone-ui.css', import.meta.url)));
  assert.match(text('web/src/main.jsx'), /styles\/standalone-ui\.css[\s\S]*\.\/app\.css/);
});

test('the pre-commit hook runs gitleaks and is executable; npm prepare points git at it', () => {
  assert.match(text('.githooks/pre-commit'), /gitleaks protect --staged/);
  assert.ok(fs.statSync(new URL('../.githooks/pre-commit', import.meta.url)).mode & 0o111);
  assert.match(text('package.json'), /core\.hooksPath \.githooks/);
});

test('npm test globs files (never a directory) in every workspace', () => {
  assert.match(JSON.parse(text('server/package.json')).scripts.test, /node --test test\/\*\.test\.js/);
  assert.match(JSON.parse(text('web/package.json')).scripts.test, /vitest run/);
});

test('required docs exist and carry the simulated-versus-real and UNVERIFIED sections', () => {
  for (const f of ['README.md', 'docs/architecture.md', 'docs/safety.md', 'docs/references.md']) assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), f);
  assert.match(text('docs/safety.md'), /## Simulated versus real/);
  assert.match(text('docs/safety.md'), /## UNVERIFIED/);
});

test('step 2 docs and the host-run script exist; live checks are instructions only', () => {
  for (const f of ['docs/talk-track.md', 'docs/live-checks.md', 'docs/shelf-entry.json', 'scripts/run.sh', '.dockerignore', '.env.example', '.nvmrc', 'scripts/build-talk-track.mjs']) assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), f);
  assert.ok(fs.statSync(new URL('../scripts/run.sh', import.meta.url)).mode & 0o111, 'run.sh is executable');
  assert.match(text('docs/live-checks.md'), /instructions only/);
  assert.match(text('docs/talk-track.md'), /UNVERIFIED/);
  assert.match(text('.dockerignore'), /node_modules/);
});

test('scripts/mock.mjs --help prints usage and exits instead of starting a server', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [new URL('./mock.mjs', import.meta.url).pathname, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: node scripts\/mock\.mjs/);
});

test('standalone repo: no parent-project name in the licence or schema comment', () => {
  assert.ok(!/AI-DEMO2/.test(text('LICENSE')));
  assert.ok(!/AI-DEMO2/.test(text('docs/content-pack.schema.json')));
});

test('the container runs as the non-root node user, and the forbidden-strings gate is a real history grep in CI', () => {
  assert.match(text('Dockerfile'), /^USER node$/m);
  assert.match(text('.github/workflows/ci.yml'), /grep -cF -f/);
});

test('CLAUDE.md exists and the README has the title, the plain Tier, Repo and Catalog lines and the 12 sections in order', () => {
  assert.ok(fs.existsSync(new URL('../CLAUDE.md', import.meta.url)));
  const r = text('README.md');
  assert.match(r, /^# MCP Auth Conformance LAB$/m);
  assert.match(r, /^Tier: Tester$/m);
  assert.match(r, /^Repo: https:\/\/github.com/curtismu7\/mcp-auth-conformance-LAB$/m);
  assert.match(r, /^Catalog: D35\+D2$/m);
  const heads = [...r.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const order = ['What is simulated', 'Run from a clone', 'Settings file', 'Ports, and what to do if the port is taken', 'Mock and live modes', 'Health, doctor and reset', 'Docker (optional)', 'Tests', 'Troubleshooting', 'Ownership'];
  let at = -1;
  for (const h of order) { const i = heads.indexOf(h); assert.ok(i > at, `section "${h}" is present and in order`); at = i; }
  assert.match(r, /Port range for this app: 4900-4949\./);
  assert.match(r, /lsof -iTCP:4901 -sTCP:LISTEN -n -P/);
});
