// Stories as data. verticals.json carries the cast, scenarios.json the steps. {{tokens}} are filled from the chosen vertical,
// so one story reads right for banking, travel and retail.
import fs from 'node:fs';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
export const VERTICALS = load('verticals.json');
export const SCENARIOS = load('scenarios.json');
export const getVertical = (id) => VERTICALS.find((v) => v.id === id);
export const getScenario = (idOrSlug) => SCENARIOS.find((s) => s.id === idOrSlug || s.slug === idOrSlug);

export function render(value, tokens) {
  if (typeof value === 'string') return value.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in tokens ? String(tokens[k]) : m));
  if (Array.isArray(value)) return value.map((x) => render(x, tokens));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, render(x, tokens)]));
  return value;
}
export const renderScenario = (scenario, vertical) => render(scenario, vertical.cast);

// Every string a pack can put on screen, for the host scan.
export const storyCorpus = () => [
  ...VERTICALS.map((v) => ({ where: `vertical ${v.id}`, text: JSON.stringify(v) })),
  ...SCENARIOS.map((s) => ({ where: `scenario ${s.id}`, text: JSON.stringify(s) })),
];
