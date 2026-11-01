// Writes docs/talk-track.md from server/data/talk-track.json (so the doc and the data cannot drift; a test checks it).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderTalkTrackMarkdown } from '../server/src/talkTrack.js';

const file = fileURLToPath(new URL('../docs/talk-track.md', import.meta.url));
fs.writeFileSync(file, renderTalkTrackMarkdown());
console.log('wrote docs/talk-track.md');
