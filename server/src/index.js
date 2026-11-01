import { createApp } from './app.js';
import { resolveBind } from './safety.js';
import { installNetguard } from './netguard.js';
import { applySharedSettings } from './settings.js';

installNetguard();
applySharedSettings();
const { host, port } = resolveBind();
const { app } = await createApp();
app.listen(port, host, () => console.log(`MCP Auth Conformance LAB listening on http://${host.includes(':') ? `[${host}]` : host}:${port} (Mock targets; the Live probe is loopback-only unless CONFLAB_PROBE_EXTERNAL=1)`));
