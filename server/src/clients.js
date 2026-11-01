import fs from 'node:fs';
import { REF_BY_ID } from './references.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/clients.json', import.meta.url), 'utf8'));
export const CLIENTS = data;
// Public form: every client carries its source reference and a verified flag the UI must show.
export const publicClients = () => ({ asOf: data.asOf, note: data.note, clients: data.clients.map((c) => ({ ...c, sourceRef: (({ id, label, url, verified }) => ({ id, label, url, verified }))(REF_BY_ID.get(c.source)) })) });
