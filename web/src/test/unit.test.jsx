import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Inert, reveal } from "../lib/Inert.jsx";
import { fill } from "../lib/fill.js";
import { CheckList, scoreTone } from "../lib/ui.jsx";
import { boxesFromDiagram, demoSteps, litEdgeIndex, nodeFor, sides, stepsFromTrace } from "../lib/diagram.js";
import { loadDiagram } from "../../../server/src/diagramData.js";
import fs from "node:fs";
import path from "node:path";

afterEach(cleanup);

describe("inert text", () => {
  it("shows markup as text and control or bidi characters as chips", () => {
    render(<Inert text={'<img src=x onerror=alert(1)>‮abc\u0007'} />);
    const el = screen.getByTestId("inert");
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(el.textContent).toContain("[U+202E]");
    expect(el.textContent).toContain("[U+0007]");
    expect(reveal("a\u0000b").length).toBe(3);
  });
  it("copes with a megabyte of input without recursion", () => {
    render(<Inert text={"x".repeat(1_000_000)} />);
    expect(screen.getByTestId("inert").textContent.length).toBe(1_000_000);
  });
});

describe("fill", () => {
  it("fills known tokens and leaves unknown ones visible", () => {
    expect(fill("{{org}} runs {{nope}}", { org: "Harbor Credit" })).toBe("Harbor Credit runs {{nope}}");
  });
});

describe("check list", () => {
  const mk = (id, status, level = "MUST") => ({ id, title: `t-${id}`, status, level, severity: status === "fail" ? "high" : null, evidence: ["e"], clause: "c", why: "w", fix: status === "fail" ? "do this" : null, references: [{ id: "r", label: "RFC x", verified: false }] });
  it("states status and level in words, opens failures, and labels unverified sources", () => {
    render(<CheckList checks={[mk("a", "pass"), mk("b", "fail", "SHOULD")]} />);
    expect(screen.getByTestId("check-b")).toHaveAttribute("open");
    expect(screen.getByTestId("check-a")).not.toHaveAttribute("open");
    expect(screen.getByTestId("check-b")).toHaveTextContent("FAIL");
    expect(screen.getByTestId("check-b")).toHaveTextContent("SHOULD");
    expect(screen.getByTestId("fix")).toHaveTextContent("do this");
    expect(screen.getAllByText("UNVERIFIED").length).toBe(2);
  });
  it("filters and says so when nothing matches", () => {
    render(<CheckList checks={[mk("a", "pass")]} filter="fail" />);
    expect(screen.getByTestId("no-checks")).toBeInTheDocument();
  });
  it("scoreTone is never colour-only information", () => {
    expect([scoreTone(100), scoreTone(70), scoreTone(10), scoreTone(null)]).toEqual(["ok", "hold", "deny", "hold"]);
  });
});

describe("diagram data", () => {
  it("maps request labels to boxes and treats a 403 as the scope check", () => {
    expect(nodeFor("Fetch protected resource metadata (path)", 200)).toBe("prm");
    expect(nodeFor("Authorization server metadata", 200)).toBe("asm");
    expect(nodeFor("Token request (resource)", 200)).toBe("authz");
    expect(nodeFor("Unauthenticated MCP request", 401)).toBe("rs");
    expect(nodeFor("Write tool with a read token", 403)).toBe("scope");
    expect(nodeFor("something else", 200)).toBeNull();
    const steps = stepsFromTrace([{ label: "Unauthenticated MCP request", response: { status: 401 } }, { label: "nothing", response: { status: 200 } }]);
    expect(steps.map((s) => s.node)).toEqual(["client", "rs"]);
    expect(stepsFromTrace(undefined)).toHaveLength(1);
  });
  it("the built-in path only uses boxes that exist, and lights the arrow it walks", () => {
    const doc = loadDiagram("mcp-authorization-flow");
    const ids = new Set(boxesFromDiagram(doc).map((b) => b.id));
    expect(demoSteps(doc).every((s) => ids.has(s.node))).toBe(true);
    expect(litEdgeIndex(doc.edges, { node: "rs", edge: 0 }, null)).toBe(0);
    expect(litEdgeIndex(doc.edges, { node: "prm" }, "rs")).toBe(1);
    expect(litEdgeIndex(doc.edges, { node: "client" }, null)).toBe(-1);
    expect(litEdgeIndex(doc.edges, null, null)).toBe(-1);
  });
  it("arrows leave the side of a box that faces the next one", () => {
    expect(sides({ x: 0, y: 0 }, { x: 300, y: 0 })).toEqual(["r", "l"]);
    expect(sides({ x: 300, y: 0 }, { x: 0, y: 0 })).toEqual(["l", "r"]);
    expect(sides({ x: 0, y: 0 }, { x: 0, y: 200 })).toEqual(["b", "t"]);
    expect(sides({ x: 0, y: 200 }, { x: 0, y: 0 })).toEqual(["t", "b"]);
  });
});

describe("theme tokens", () => {
  const dir = path.resolve(__dirname, "..");
  const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
  it("the app stylesheet has no purple, no colour literal, no dark-mode query of its own and no forced priority", () => {
    expect(css).not.toMatch(/purple|violet|indigo/i);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/!important/);
    expect(css).not.toMatch(/font-style:\s*italic/);
    for (const m of css.matchAll(/@media \(max-width: (\d+)px\)/g)) expect(["600", "900"]).toContain(m[1]);
  });
  it("the shared stylesheet is loaded before the app stylesheet and carries dark mode both ways", () => {
    const main = fs.readFileSync(path.join(dir, "main.jsx"), "utf8");
    expect(main.indexOf("styles/standalone-ui.css")).toBeGreaterThan(-1);
    expect(main.indexOf("styles/standalone-ui.css")).toBeLessThan(main.indexOf("./app.css"));
    const shared = fs.readFileSync(path.join(dir, "styles/standalone-ui.css"), "utf8");
    expect(shared).toMatch(/prefers-color-scheme: dark/);
    expect(shared).toMatch(/:root\[data-theme="dark"\]/);
  });
  it("component code takes colours from tokens, not literals, and sets no inline style", () => {
    const files = ["App.jsx", "tabs/ScorecardTab.jsx", "tabs/StoriesTab.jsx", "tabs/ProbeTab.jsx", "tabs/ClientsTab.jsx", "tabs/DiagramTab.jsx", "tabs/RawTab.jsx", "lib/ui.jsx", "lib/Inert.jsx"];
    for (const f of files) {
      const code = fs.readFileSync(path.join(dir, f), "utf8");
      expect(code, f).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
      expect(code, f).not.toMatch(/style=\{\{/);
    }
  });
});
