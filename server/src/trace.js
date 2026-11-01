// Trace envelope: one ordered list of messages, each with a W3C traceparent. Text is made inert before it is stored.
import { randomBytes } from 'node:crypto';

const hex = (n) => randomBytes(n).toString('hex');
// Inert: control characters out, length capped. The UI renders it as text only (never HTML).
export const inert = (v, max = 600) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '?').slice(0, max);
const redactAuth = (h = {}) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), /^(authorization|cookie|set-cookie)$/i.test(k) ? String(v).replace(/^(\S+)\s.*$/, '$1 ***') : inert(v, 400)]));

export function createTrace({ clock = () => Date.now() } = {}) {
  const traceId = hex(16);
  const messages = [];
  return {
    traceId,
    messages,
    nextTraceparent() { return `00-${traceId}-${hex(8)}-01`; },
    add({ op = 'http', label, from = 'lab', to = 'target', traceparent, request, response, note }) {
      messages.push({
        seq: messages.length + 1, op, label: inert(label, 200), from, to, traceparent, spanId: traceparent ? traceparent.split('-')[2] : hex(8), at: new Date(clock()).toISOString(),
        ...(request ? { request: { method: request.method, url: inert(request.url, 300), headers: redactAuth(request.headers), body: request.body ? inert(request.body, 400) : undefined } } : {}),
        ...(response ? { response: { status: response.status, headers: redactAuth(response.headers), body: response.body ? inert(response.body, 800) : undefined, ...(response.error ? { error: inert(response.error, 200) } : {}) } } : {}),
        ...(note ? { note: inert(note, 400) } : {}),
      });
      return messages.at(-1);
    },
    envelope() { return { schema: 'conformance-trace/1', traceId, messages }; },
  };
}
