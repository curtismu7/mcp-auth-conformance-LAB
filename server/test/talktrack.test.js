import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TALK_TRACK, formatStories, renderTalkTrackMarkdown, unknownStories } from '../src/talkTrack.js';

test('docs/talk-track.md is exactly what the data renders (run npm run talk-track after editing server/data/talk-track.json)', () => {
  const file = fs.readFileSync(new URL('../../docs/talk-track.md', import.meta.url), 'utf8');
  assert.equal(file, renderTalkTrackMarkdown());
});

test('every story the talk track names is a real scenario, and the track says UNVERIFIED and names the Live toggle', () => {
  assert.deepEqual(unknownStories(), []);
  assert.deepEqual(unknownStories({ flow: [{ stories: ['S01', 'S99'] }] }), ['S99']);
  const md = renderTalkTrackMarkdown();
  assert.match(md, /UNVERIFIED/); assert.match(md, /Mock \| Live/);
  assert.ok(TALK_TRACK.flow.length >= 6 && TALK_TRACK.questions.length >= 5);
});

test('rendering changes when the data changes (the drift test would catch an edit to one side only)', () => {
  const changed = structuredClone(TALK_TRACK); changed.flow[0].say += ' extra';
  assert.notEqual(renderTalkTrackMarkdown(changed), renderTalkTrackMarkdown());
});

test('story ids read aloud: runs of three or more become "S17 to S19", the rest are comma-separated', () => {
  assert.equal(formatStories(['S17', 'S18', 'S19']), 'S17 to S19');
  assert.equal(formatStories(['S02', 'S03', 'S05']), 'S02, S03, S05');
  assert.equal(formatStories(['S15', 'S16']), 'S15, S16');
  assert.equal(formatStories(['S01']), 'S01');
  assert.equal(formatStories(['S02', 'S03', 'S04', 'S06', 'S07', 'S08', 'S09', 'S12']), 'S02 to S04, S06 to S09, S12');
  assert.equal(formatStories([]), '');
  assert.match(renderTalkTrackMarkdown(), /Live probe \(optional\), S17 to S19 /);
});
