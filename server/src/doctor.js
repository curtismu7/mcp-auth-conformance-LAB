// Preflight checks shared by `npm run doctor` and GET /api/health. Never prints a secret, needs no network.
// Each check: { id, level: 'pass' | 'info' | 'fail', detail }. selfCheck is the cheap subset (no sockets) used for health.
import { resolveBind, scanHosts, PORT_MIN, PORT_MAX } from './safety.js';
import { netguardSelfTest } from './netguard.js';
import { storyCorpus, VERTICALS, SCENARIOS } from './stories.js';
import { CHECKS } from './engine.js';
import { DEFECTS } from './mock.js';
import { REFS } from './references.js';
import { runAllScenarios } from './scenarios.js';
import { STORY_HOST_ALLOW } from './hosts.js';
import { DIAGRAM_NAMES, getDiagram } from './diagramData.js';
import { unknownStories } from './talkTrack.js';
import { settingsFileStatus, settingsPath } from './settings.js';

export async function selfCheck({ env = process.env } = {}) {
  const checks = []; const add = (id, level, detail) => checks.push({ id, level, detail });
  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 26 ? 'pass' : 'fail', `v${process.versions.node} (need >= 26)`);
  try { const b = resolveBind(env); add('bind', 'pass', `${b.host}:${b.port} inside ${PORT_MIN}-${PORT_MAX}${env.CONFLAB_BIND ? ' (CONFLAB_BIND opt-in)' : ' (loopback)'}`); } catch (e) { add('bind', 'fail', e.message); }
  const bad = storyCorpus().map(({ where, text }) => ({ where, hosts: scanHosts(text, STORY_HOST_ALLOW) })).filter((x) => x.hosts.length);
  add('story-hosts', bad.length ? 'fail' : 'pass', bad.length ? bad.map((b) => `${b.where}: ${b.hosts.join(', ')}`).join('; ') : 'every host in every story is .invalid, .example, loopback or an allow-listed refusal input');
  const ids = new Set(CHECKS.map((c) => c.id));
  const missing = DEFECTS.flatMap((d) => [...(d.fails || []), ...(d.warns || [])]).filter((id) => !ids.has(id));
  const unref = CHECKS.flatMap((c) => c.spec).filter((s) => !REFS.some((r) => r.id === s));
  add('rules-data', missing.length || unref.length ? 'fail' : 'pass', missing.length || unref.length ? `unknown ids: ${[...missing, ...unref].join(', ')}` : `${CHECKS.length} checks, ${DEFECTS.length} defects, ${REFS.length} references, ${SCENARIOS.length} scenarios, ${VERTICALS.length} verticals`);
  const ng = await netguardSelfTest();
  add('netguard', ng.ok ? 'pass' : 'fail', ng.ok ? `blocked fetch, socket, socket-by-IP, dns lookup, dns resolve, udp send and udp connect to a non-loopback host (${ng.blocked}/${ng.total})` : `not blocked: ${ng.detail}`);
  const bad2 = DIAGRAM_NAMES.filter((n) => !getDiagram(n));
  add('diagram', bad2.length ? 'fail' : 'pass', bad2.length ? `not loadable: ${bad2.join(', ')}` : `${DIAGRAM_NAMES.length} diagram-studio/1 diagram loaded by name and valid`);
  const missingStories = unknownStories();
  add('talk-track', missingStories.length ? 'fail' : 'pass', missingStories.length ? `the talk track names unknown stories: ${missingStories.join(', ')}` : 'every story the talk track names is a scenario');
  const st = settingsFileStatus(settingsPath(env));
  add('settings', st.exists && st.mode600 ? 'pass' : 'info', st.exists ? (st.mode600 ? 'shared settings file found, owner-only (this lab reads one optional key; no value is printed)' : 'shared settings file is readable by others: chmod 600 it') : 'no shared settings file (optional: Mock mode needs none)');
  add('tenant', 'pass', 'mock only: no tenant, no credentials, no outbound network');
  add('probe', env.CONFLAB_PROBE_EXTERNAL === '1' ? 'info' : 'pass', env.CONFLAB_PROBE_EXTERNAL === '1' ? 'external probe targets ENABLED (CONFLAB_PROBE_EXTERNAL=1): the Live probe may contact the one https URL you type' : 'the Live probe is loopback-only (external targets off)');
  return checks;
}

export async function runChecks(opts) {
  const checks = await selfCheck(opts);
  try {
    const failed = [];
    let n = 0;
    for (const v of VERTICALS) for (const r of await runAllScenarios(v.id)) { n += 1; if (!r.pass) failed.push(`${r.id}/${v.id}: ${r.problems.join('; ')}`); }
    checks.push({ id: 'scenarios', level: failed.length ? 'fail' : 'pass', detail: failed.length ? failed.join(' | ') : `${n} scenario runs across ${VERTICALS.length} verticals all behave as written` });
  } catch (e) { checks.push({ id: 'scenarios', level: 'fail', detail: e.message }); }
  return checks;
}
export const allPassed = (checks) => checks.every((c) => c.level !== 'fail');
