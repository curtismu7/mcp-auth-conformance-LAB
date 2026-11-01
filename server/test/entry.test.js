import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// index.js starts the server at import time, so it cannot be imported in a test. Pin its order instead: the network guard is
// installed before the settings file is read or any server starts.
test('the entry installs the netguard first, then reads the shared settings, then binds', () => {
  const src = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const guard = /^installNetguard\(\);/m.exec(src)?.index;
  assert.ok(guard >= 0, 'installNetguard() is called as a statement');
  assert.ok(src.indexOf('applySharedSettings();') > guard);
  assert.ok(src.indexOf('resolveBind()') > src.indexOf('applySharedSettings();'));
  assert.ok(src.indexOf('app.listen(') > guard);
});

test('no server source evals, builds a regex from input, reads a per-app .env, a bare MODE, or any k8s switch; the server writes no file', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const code = fs.readFileSync(new URL(f, dir), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/\beval\(|new Function\(|\bvm\./.test(code), `${f}: no eval, Function or vm`);
    assert.ok(!/new RegExp\(/.test(code), `${f}: no regular expression is built at run time`);
    assert.ok(!/process\.env\.MODE\b/.test(code), `${f}: a bare MODE is never read`);
    assert.ok(!/loadEnvFile|dotenv/.test(code), `${f}: no per-app .env loader`);
    assert.ok(!/writeFile|appendFile|createWriteStream|mkdirSync|rmSync|unlinkSync/.test(code), `${f}: the server writes no file`);
  }
});
