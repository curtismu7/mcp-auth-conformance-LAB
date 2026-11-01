// The diagram is diagram-studio/1 DATA (server/diagrams/*.json), loaded by name and checked with the studio's own validator copy.
// Nothing here builds nodes or edges by hand. A step's `hop` is the HTTP status of that hop (the format allows a short id there).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDiagram } from './diagramStudioValidate.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../diagrams');
export const DIAGRAM_NAMES = ['mcp-authorization-flow'];

export function loadDiagram(name) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
  const problems = validateDiagram(doc);
  if (problems.length) throw new Error(`diagram ${name} is not valid diagram-studio/1: ${problems.join('; ')}`);
  return doc;
}
const DOCS = Object.fromEntries(DIAGRAM_NAMES.map((n) => [n, loadDiagram(n)]));
export const getDiagram = (name) => (typeof name === 'string' && Object.hasOwn(DOCS, name) ? DOCS[name] : null);
