import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

// Every published port must be bound to loopback on the host. A small line parser (no YAML dependency).
export function publishedPorts(text) {
  const out = []; const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)ports:\s*$/.exec(lines[i]); if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const item = /^\s*-\s*["']?([^"'\s#]+)["']?/.exec(lines[j]);
      if (!item || lines[j].search(/\S/) <= m[1].length) break;
      out.push(item[1]);
    }
  }
  return out;
}
const here = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('docker-compose.yml publishes only on 127.0.0.1, inside 4900-4949', () => {
  const ports = publishedPorts(here('docker-compose.yml'));
  assert.ok(ports.length > 0, 'the parser found the published port');
  for (const p of ports) assert.match(p, /^127\.0\.0\.1:/, `${p} must start with 127.0.0.1:`);
  assert.match(here('docker-compose.yml'), /\$\{HOST_PORT:-49\d\d\}/);
});

test('the parser flags an unbound or wildcard publish', () => {
  for (const bad of ['- "4901:4901"', '- "0.0.0.0:4901:4901"', '- 4901', '- "::1:4901:4901"']) {
    const ports = publishedPorts(`services:\n  a:\n    ports:\n      ${bad}\n`);
    assert.ok(ports.length === 1 && !/^127\.0\.0\.1:/.test(ports[0]), bad);
  }
});

test('Docker never enables external probing; the container is read-only and drops capabilities', () => {
  for (const f of ['docker-compose.yml', 'Dockerfile']) assert.ok(!/^\s*(ENV\s+)?CONFLAB_PROBE_EXTERNAL/m.test(here(f)), `${f} sets CONFLAB_PROBE_EXTERNAL`);
  const c = here('docker-compose.yml');
  assert.match(c, /read_only: true/); assert.match(c, /cap_drop: \[ALL\]/); assert.match(c, /no-new-privileges/);
});
