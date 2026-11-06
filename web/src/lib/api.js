// Same origin only: every URL is a path. call() never throws on 4xx (the lab answers refusals as normal responses); it throws only
// when the server cannot be reached.
export async function call(method, path, body) {
  const r = await fetch(path, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
async function must(method, path, body) {
  const { status, data } = await call(method, path, body);
  if (status >= 400) throw new Error(data.message || `HTTP ${status}`);
  return data;
}
export const getCatalog = () => must("GET", "/api/catalog");
export const getInfo = () => must("GET", "/api/info");
export const setMode = (source) => must("POST", "/api/mode", { source });
export const getDiagram = (name) => must("GET", `/api/diagrams/${encodeURIComponent(name)}`);
export const getClients = () => must("GET", "/api/clients");
export const scan = (defects, vertical) => must("POST", "/api/scan", { defects, vertical });
export const runScenario = (id, vertical) => must("POST", "/api/scenario", { id, vertical });
export const resetServer = () => must("POST", "/api/reset", {});
// Probe refusals (412 confirmation, 422 refused, 429 busy) are shown to the viewer, not thrown.
export const probe = (url, ack) => call("POST", "/api/probe", { url, confirm: true, ack });
