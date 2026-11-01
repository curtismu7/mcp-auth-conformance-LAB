import React, { useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiagramTab from "../tabs/DiagramTab.jsx";
import { boxesFromDiagram, demoSteps } from "../lib/diagram.js";
import { loadDiagram } from "../../../server/src/diagramData.js";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const DOC = loadDiagram("mcp-authorization-flow");
const START = boxesFromDiagram(DOC);

function Harness({ initial = START, spy, card = null, diagram = DOC, diagramError = null }) {
  const [sim, setSim] = useState(-1);
  const [boxes, setBoxes] = useState(initial);
  const resetBoxes = useCallback(() => setBoxes(boxesFromDiagram(diagram)), [diagram]);
  spy.boxes = boxes; spy.sim = sim;
  return <DiagramTab app={{ card, sim, setSim, boxes, setBoxes, diagram, diagramError, resetBoxes, theme: "light" }} />;
}
const simulate = () => screen.getByRole("button", { name: "Simulate" });

describe("authorization flow diagram (diagram-studio/1 data)", () => {
  it("draws six boxes from the data, in a labelled group", () => {
    expect(START.map((b) => b.id)).toEqual(["client", "rs", "prm", "asm", "authz", "scope"]);
    expect(START[0].position).toEqual({ x: DOC.nodes[0].x, y: DOC.nodes[0].y });
    render(<Harness spy={{}} />);
    expect(screen.getByText("3 Protected resource metadata")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Authorization flow diagram/ })).toBeInTheDocument();
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(6);
  });
  it("says so when the data is loading or failed", () => {
    render(<Harness spy={{}} diagram={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the diagram");
    cleanup();
    render(<Harness spy={{}} diagram={null} diagramError="HTTP 500" />);
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 500");
  });
  it("has a speed control with 0.5x to 4x", () => {
    render(<Harness spy={{}} />);
    expect([...screen.getByLabelText("Speed").querySelectorAll("option")].map((o) => o.textContent)).toEqual(["0.5x", "1x", "2x", "4x"]);
  });
  it("Reset restores the box positions AND the simulation", async () => {
    const spy = {};
    render(<Harness initial={START.map((b) => ({ ...b, position: { x: 1, y: 1 } }))} spy={spy} />);
    await userEvent.click(simulate());
    expect(spy.sim).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(spy.boxes).toEqual(START);
    expect(spy.sim).toBe(-1);
    expect(screen.getByTestId("caption")).toHaveTextContent("Press Simulate");
  });
  it("Simulate walks the built-in path from the data and marks the 403 in words", async () => {
    vi.useFakeTimers();
    const spy = {};
    render(<Harness spy={spy} />);
    await act(async () => { simulate().click(); });
    for (let i = 0; i < 4; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
    expect(spy.sim).toBe(4);
    expect(screen.getByTestId("caption")).toHaveTextContent("REFUSED 403");
    expect(screen.getByTestId("caption")).toHaveAttribute("data-state", "deny");
    await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
    expect(spy.sim).toBe(DOC.steps.length - 1);
    expect(screen.getByTestId("caption")).toHaveAttribute("data-state", "ok");
  });
  it("the built-in path is the data: each step walks one real arrow and lands on a real box", () => {
    const steps = demoSteps(DOC);
    expect(steps).toHaveLength(DOC.steps.length);
    const ids = new Set(DOC.nodes.map((n) => n.id));
    expect(steps.every((s) => ids.has(s.node) && s.edge < DOC.edges.length)).toBe(true);
    expect(steps.map((s) => s.status)).toEqual([401, 200, 200, 200, 403, 200]);
  });
  it("Simulate uses aria-disabled while running, so focus stays on the button", async () => {
    vi.useFakeTimers();
    const spy = {};
    render(<Harness spy={spy} />);
    simulate().focus();
    await act(async () => { simulate().click(); });
    expect(simulate()).toHaveAttribute("aria-disabled", "true");
    expect(simulate()).not.toBeDisabled();
    expect(document.activeElement).toBe(simulate());
    await act(async () => { simulate().click(); }); // a second press while running does nothing
    expect(spy.sim).toBe(0);
  });
  it("speed changes the pace", async () => {
    vi.useFakeTimers();
    const spy = {};
    render(<Harness spy={spy} />);
    await act(async () => { const s = screen.getByLabelText("Speed"); s.value = "4"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { simulate().click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(450); });
    expect(spy.sim).toBe(1);
  });
  it("walks the requests of a real scorecard when there is one", async () => {
    const card = { trace: { messages: [{ label: "Unauthenticated MCP request", response: { status: 401 } }, { label: "Fetch protected resource metadata (path)", response: { status: 404 } }] } };
    render(<Harness spy={{}} card={card} />);
    expect(screen.getByTestId("caption")).toHaveTextContent("requests from the scorecard");
    await userEvent.click(simulate());
    expect(screen.getByTestId("caption")).toHaveTextContent("Step 1 of 3");
  });
});
