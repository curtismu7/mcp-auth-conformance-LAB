import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, Handle, MarkerType, ReactFlow, ReactFlowProvider, applyNodeChanges } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Inert } from "../lib/Inert.jsx";
import { POS, boxesFromDiagram, demoSteps, litEdgeIndex, sides, stepsFromTrace } from "../lib/diagram.js";
import { REFIT_EVENT, useFitOnResize } from "../lib/useFitOnResize.js";

// The MCP authorization flow, drawn from diagram-studio/1 data loaded by name (rule 17). Boxes are draggable; Simulate walks the
// scorecard's real requests on screen (or the built-in path from the diagram data when there is none); Reset puts the boxes and the
// simulation back; the speed control sets the pace.
const SPEEDS = [["0.5", "0.5x"], ["1", "1x"], ["2", "2x"], ["4", "4x"]];
const BASE_MS = 1600;
const FIT = { padding: 0.12 };
// At phone width the whole wide diagram would be unreadable, so the view holds at 0.8 on the first two boxes; drag the background to pan.
const narrow = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches;

function Box({ data }) {
  return (
    <div className="flow-box" data-color={data.color} data-on={data.on ? "true" : "false"} data-deny={data.deny ? "true" : "false"} data-dim={data.dim ? "true" : "false"}>
      {Object.entries(POS).map(([id, pos]) => (
        <React.Fragment key={id}><Handle id={id} type="source" position={pos} /><Handle id={id} type="target" position={pos} /></React.Fragment>
      ))}
      <strong>{data.title}</strong>
      {data.sub.map((line) => <span key={line}>{line}</span>)}
    </div>
  );
}
const nodeTypes = { box: Box };

function Canvas({ nodes, edges, onNodesChange, firstTwo }) {
  const ref = useRef(null);
  const fit = useMemo(() => (narrow() ? { padding: 0.1, minZoom: 0.8, maxZoom: 0.8, nodes: firstTwo.map((id) => ({ id })) } : FIT), [firstTwo]);
  useFitOnResize(ref, fit);
  return (
    <div ref={ref} className="flow-wrap">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} fitView fitViewOptions={fit}
        nodesConnectable={false} proOptions={{ hideAttribution: true }} minZoom={0.2}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export default function DiagramTab({ app }) {
  const { card, sim, setSim, boxes, setBoxes, diagram, diagramError, resetBoxes } = app;
  const [speed, setSpeed] = useState("1");
  const [running, setRunning] = useState(false);
  const fromScan = !!card?.trace?.messages?.length;
  const steps = useMemo(() => (fromScan ? stepsFromTrace(card.trace.messages) : demoSteps(diagram)), [card, fromScan, diagram]);
  const edgeList = diagram?.edges || [];

  useEffect(() => { setRunning(false); }, [card]);
  useEffect(() => {
    if (!running) return undefined;
    if (sim >= steps.length - 1) { setRunning(false); return undefined; }
    const t = setTimeout(() => setSim(sim + 1), BASE_MS / Number(speed));
    return () => clearTimeout(t);
  }, [running, sim, steps.length, speed, setSim]);

  const simulate = () => { if (running || !steps.length) return; setSim(0); setRunning(true); };
  const reset = () => { setRunning(false); setSim(-1); resetBoxes(); setTimeout(() => window.dispatchEvent(new Event(REFIT_EVENT)), 0); };
  const onNodesChange = useCallback((changes) => setBoxes((n) => applyNodeChanges(changes, n)), [setBoxes]);

  const cur = sim >= 0 ? steps[Math.min(sim, steps.length - 1)] : null;
  const node = cur?.node || null;
  const prev = useMemo(() => { for (let i = Math.min(sim, steps.length) - 1; i >= 0; i--) if (steps[i].node !== node) return steps[i].node; return null; }, [sim, steps, node]);
  const refused = cur?.status >= 400;
  const lit = litEdgeIndex(edgeList, cur, prev);
  const nodes = useMemo(() => boxes.map((n) => ({ ...n, type: "box", data: { ...n.data, on: n.id === node && !refused, deny: n.id === node && refused, dim: !!node && n.id !== node } })), [boxes, node, refused]);
  const at = useMemo(() => Object.fromEntries(boxes.map((b) => [b.id, b.position])), [boxes]);
  const edges = useMemo(() => edgeList.map((e, i) => {
    const [a, b] = sides(at[e.source] || { x: 0, y: 0 }, at[e.target] || { x: 0, y: 0 });
    return { id: `e${i}`, source: e.source, target: e.target, sourceHandle: a, targetHandle: b, label: e.label, animated: i === lit, className: i === lit ? (refused ? "flow-edge flow-edge--deny" : "flow-edge flow-edge--on") : "flow-edge", markerEnd: { type: MarkerType.ArrowClosed } };
  }), [edgeList, at, lit, refused]);

  if (diagramError) return <p className="alert" role="alert">Could not load the diagram: {diagramError}</p>;
  if (!diagram) return <p className="muted" role="status">Loading the diagram...</p>;

  const caption = cur
    ? `Step ${sim + 1} of ${steps.length}: ${cur.say}${cur.status != null ? (refused ? ` REFUSED ${cur.status}.` : "") : ""}`
    : `Press Simulate to walk ${fromScan ? "the requests from the scorecard on screen" : "a built-in path"} through the diagram. Drag any box to rearrange it.`;
  const label = `Authorization flow diagram: ${diagram.nodes.map((n) => n.label.replace(/^\d+\s+/, "")).join(", ")}. Boxes can be dragged.`;

  return (
    <>
      <h2>{diagram.title}</h2>
      <p className="lede" data-admin-only>Drag any box. Simulate walks {fromScan ? "the real requests of the scorecard on screen" : "a built-in path (score a target or run a story to walk its own requests)"}. Refused steps turn red and say so.</p>
      <div className="card controls">
        <label htmlFor="speed">Speed
          <select id="speed" value={speed} onChange={(e) => setSpeed(e.target.value)}>{SPEEDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        <button type="button" className="primary" aria-disabled={running} onClick={simulate}>Simulate</button>
        <button type="button" onClick={reset}>Reset</button>
      </div>
      <div role="group" aria-label={label}>
        <ReactFlowProvider>
          <Canvas nodes={nodes} edges={edges} onNodesChange={onNodesChange} firstTwo={diagram.nodes.slice(0, 2).map((n) => n.id)} />
        </ReactFlowProvider>
      </div>
      <p className="muted small flow-hint">On a phone, drag the background to pan to the other boxes.</p>
      <p className="caption" data-state={refused ? "deny" : "ok"} role="status" aria-live="polite" data-testid="caption"><Inert text={caption} /></p>
    </>
  );
}
