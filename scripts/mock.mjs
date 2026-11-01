#!/usr/bin/env node
// Serve a mock target on loopback so probe mode can be tried against it.
//   node scripts/mock.mjs [--defects=no_iss,wrong_403] [--vertical=banking] [--port=4930]
import { startMockServer } from '../server/src/mock-http.js';
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: node scripts/mock.mjs [--defects=no_iss,wrong_403] [--vertical=banking] [--port=4930]\nServes a mock MCP target on loopback so probe mode can be tried against it.');
  process.exit(0);
}
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const srv = await startMockServer({ defects: (arg('defects') || '').split(',').filter(Boolean), vertical: arg('vertical') || 'banking', port: Number(arg('port')) || 0 });
console.log(`mock target: ${srv.mock.resource}\ndefects: ${srv.mock.defects.join(', ') || 'none'}\nProbe it from the lab with that URL. Ctrl-C to stop.`);
