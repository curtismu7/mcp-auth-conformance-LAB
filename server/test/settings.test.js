import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applySharedSettings, readSharedSettings, settingsFileStatus, settingsPath, SETTINGS_KEYS } from '../src/settings.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'conflab-settings-'));

test('the shared settings file supplies only this lab\'s one key; every other key in it is ignored', () => {
  const dir = tmp(); const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'CONFLAB_PROBE_EXTERNAL=1\nMODE=live\nPORT=9999\nPINGONE_CLIENT_SECRET=do-not-load\nCONFLAB_PORT=4999\n', { mode: 0o600 });
  assert.deepEqual(SETTINGS_KEYS, ['CONFLAB_PROBE_EXTERNAL']);
  assert.deepEqual(readSharedSettings(file), { CONFLAB_PROBE_EXTERNAL: '1' });
  const env = applySharedSettings({}, file);
  assert.deepEqual(env, { CONFLAB_PROBE_EXTERNAL: '1' });
});

test('a value already in the environment wins; a missing or unreadable file gives the defaults', () => {
  const dir = tmp(); const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'CONFLAB_PROBE_EXTERNAL=1\n');
  assert.equal(applySharedSettings({ CONFLAB_PROBE_EXTERNAL: '0' }, file).CONFLAB_PROBE_EXTERNAL, '0');
  assert.deepEqual(readSharedSettings(path.join(dir, 'missing.env')), {});
  assert.deepEqual(readSharedSettings(dir), {});
});

test('STANDALONE_ENV overrides the default path, which is ~/Development/.env', () => {
  assert.equal(settingsPath({ STANDALONE_ENV: '/x/y.env' }), '/x/y.env');
  assert.equal(settingsPath({}), path.join(os.homedir(), 'Development', '.env'));
});

test('the status reports existence and mode only, never a value', () => {
  const dir = tmp(); const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'CONFLAB_PROBE_EXTERNAL=1\n', { mode: 0o600 });
  assert.deepEqual(settingsFileStatus(file), { exists: true, mode600: true });
  fs.chmodSync(file, 0o644);
  assert.deepEqual(settingsFileStatus(file), { exists: true, mode600: false });
  assert.deepEqual(settingsFileStatus(path.join(dir, 'none')), { exists: false, mode600: null });
});
