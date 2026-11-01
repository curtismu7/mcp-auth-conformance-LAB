// Diagram helpers. The diagram itself is diagram-studio/1 data served by the API (GET /api/diagrams/:name); nothing here builds nodes
// or edges by hand. A step's `hop` is the HTTP status of that hop.
import { Position } from "@xyflow/react";

export const POS = { l: Position.Left, r: Position.Right, t: Position.Top, b: Position.Bottom };

// ReactFlow nodes from the diagram data: the starting positions Reset puts the boxes back to.
export const boxesFromDiagram = (doc) => (doc?.nodes || []).map((n) => ({
  id: n.id, position: { x: n.x, y: n.y }, data: { title: n.label, sub: n.sub || [], color: doc.groups?.[n.group]?.color || "dark" },
}));

// The built-in path: each step walks one arrow and lights the box it arrives at.
export const demoSteps = (doc) => (doc?.steps || []).map((s) => {
  const e = doc.edges[s.edges[0]];
  return { node: e.target, edge: s.edges[0], say: s.what, title: s.title, status: s.hop ? Number(s.hop) : undefined };
});

// Which box a recorded request belongs to. A 403 from the MCP endpoint is the scope check, not the plain challenge.
export function nodeFor(label, status) {
  if (/protected resource metadata|cannot exist/i.test(label)) return "prm";
  if (/authorization server metadata|jwks/i.test(label)) return "asm";
  if (/authoriz|token request|registration|mint|audience/i.test(label)) return "authz";
  if (/unauthenticated|no token|write tool/i.test(label)) return status === 403 || /write tool/i.test(label) ? "scope" : "rs";
  return null;
}
export function stepsFromTrace(messages) {
  const out = [{ node: "client", say: "The lab, acting as an MCP client, starts with no token." }];
  for (const m of messages || []) {
    const node = nodeFor(m.label || "", m.response?.status);
    if (node) out.push({ node, say: `${m.label}: HTTP ${m.response?.status || "no answer"}.`, status: m.response?.status });
  }
  return out;
}

// The arrow to light for a step: the one it walks (built-in path), else the arrow into the box from the previous box.
export function litEdgeIndex(edges, step, prevNode) {
  if (!step) return -1;
  if (Number.isInteger(step.edge)) return step.edge;
  const into = edges.map((e, i) => ({ e, i })).filter(({ e }) => e.target === step.node);
  return (into.find(({ e }) => e.source === prevNode) || into[0])?.i ?? -1;
}

// The sides of the two boxes that face each other, so an arrow leaves toward its target.
export function sides(a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ["r", "l"] : ["l", "r"]) : (dy > 0 ? ["b", "t"] : ["t", "b"]);
}
