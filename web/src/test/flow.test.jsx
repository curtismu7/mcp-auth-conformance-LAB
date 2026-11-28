import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.jsx";
import { setJsonView } from "../components/JsonPane.jsx";
import { startLive } from "./liveServer.js";
import { startMockServer } from "../../../server/src/mock-http.js";

let live;
beforeAll(async () => { live = await startLive(); });
afterAll(async () => { await live.stop(); });
beforeEach(async () => { window.location.hash = "#/scorecard"; document.documentElement.removeAttribute("data-present"); document.documentElement.removeAttribute("data-theme"); try { localStorage.clear(); } catch { /* none */ } setJsonView("raw"); if (live) await fetch("/api/mode", { method: "POST", headers: { "content-type": "application/json" }, body: '{"source":"mock"}' }); });
afterEach(cleanup);

// The six sections are the pill links in the shell bar's nav (aria-current="page" marks the open one).
const navLink = (name) => within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name });
const open = async (tab) => {
  render(<App />);
  await screen.findByRole("navigation", { name: "Sections" });
  if (tab) { await userEvent.click(navLink(tab)); await waitFor(() => expect(navLink(tab)).toHaveAttribute("aria-current", "page")); }
};
const goLive = async () => { await userEvent.selectOptions(screen.getByTestId("mode-select"), "real"); await waitFor(() => expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live")); };
const status = (id) => within(screen.getByTestId(`check-${id}`)).getAllByText(/^(PASS|FAIL|WARN|NOT TESTED|INFO)$/)[0].textContent;

describe("shell", () => {
  it("shows what is simulated on every tab, including in presenter mode", async () => {
    await open();
    expect(screen.getByTestId("banner")).toHaveTextContent("Simulated (Mock mode)");
    await userEvent.click(screen.getByTestId("presenter"));
    expect(document.documentElement.dataset.present).toBe("1");
    for (const t of ["Stories", "Probe", "Clients", "Diagram", "Raw", "Scorecard"]) {
      await userEvent.click(navLink(t));
      expect(screen.getByTestId("banner")).toBeVisible();
      expect(screen.getByTestId("banner")).toHaveTextContent("No tenant");
    }
  });
  it("has a Mock | Live toggle in the header on every tab; Mock is the default; the banner and the mode chip follow it", async () => {
    await open();
    expect(screen.getByTestId("mode-select")).toHaveValue("mock");
    expect(screen.getByTestId("mode-select")).toHaveValue("mock");
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock");
    for (const t of ["Scorecard", "Stories", "Probe", "Clients", "Diagram", "Raw"]) {
      await userEvent.click(navLink(t));
      expect(screen.getByTestId("mode-select")).toBeVisible();
    }
    await goLive();
    expect(screen.getByTestId("mode-select")).toHaveValue("real");
    expect(screen.getByTestId("banner")).toHaveTextContent("Live mode. Only the Probe tab goes live");
    expect(localStorage.getItem("conflab.mode")).toBe("live");
    for (const t of ["Scorecard", "Stories", "Clients", "Diagram", "Raw"]) {
      await userEvent.click(navLink(t));
      expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live");
      expect(screen.getByTestId("live-note")).toHaveTextContent("still uses simulated in-process mock servers");
    }
    await userEvent.click(navLink("Probe"));
    expect(screen.queryByTestId("live-note")).toBeNull();
    await userEvent.selectOptions(screen.getByTestId("mode-select"), "mock");
    await waitFor(() => expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock"));
  });
  it("opens in the mode the server answers, and a bad stored value falls back to it", async () => {
    // Rule 19: the mode is server-side, so the server's /api/info answer wins over anything stored.
    localStorage.setItem("conflab.mode", "mock");
    await fetch("/api/mode", { method: "POST", headers: { "content-type": "application/json" }, body: '{"source":"real"}' });
    render(<App />); await screen.findByRole("navigation", { name: "Sections" });
    await waitFor(() => expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live"));
    cleanup();
    localStorage.setItem("conflab.mode", "<script>");
    await fetch("/api/mode", { method: "POST", headers: { "content-type": "application/json" }, body: '{"source":"mock"}' });
    render(<App />); await screen.findByRole("navigation", { name: "Sections" });
    await waitFor(() => expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock"));
  });
  it("presenter mode: P toggles, Esc leaves, the banner stays, and modifier keys or typing in a field are ignored", async () => {
    await open();
    const down = (init) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init })); });
    down({ key: "p", ctrlKey: true }); down({ key: "p", metaKey: true }); down({ key: "p", altKey: true });
    expect(document.documentElement.dataset.present).toBeUndefined();
    down({ key: "p" });
    expect(document.documentElement.dataset.present).toBe("1");
    expect(screen.getByTestId("presenter")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("banner")).toBeVisible();
    down({ key: "Escape", ctrlKey: true });
    expect(document.documentElement.dataset.present).toBe("1");
    down({ key: "Escape" });
    expect(document.documentElement.dataset.present).toBeUndefined();
    expect(screen.getByTestId("banner")).toBeVisible();
    down({ key: "P" });
    expect(document.documentElement.dataset.present).toBe("1");
    down({ key: "P" });
    expect(document.documentElement.dataset.present).toBeUndefined();
    await userEvent.selectOptions(screen.getByLabelText("Vertical"), "banking");
    screen.getByLabelText("Vertical").focus();
    await userEvent.keyboard("p");
    expect(document.documentElement.dataset.present).toBeUndefined();
    await userEvent.click(navLink("Probe"));
    await userEvent.type(screen.getByLabelText("Target MCP endpoint URL"), "pp");
    expect(document.documentElement.dataset.present).toBeUndefined();
  });
  it("has the six sections as shell-bar nav pills; the open one carries aria-current and follows the hash", async () => {
    await open();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByRole("link").map((t) => t.textContent)).toEqual(["Scorecard", "Stories", "Probe", "Clients", "Diagram", "Raw"]);
    expect(navLink("Scorecard")).toHaveAttribute("aria-current", "page");
    expect(navLink("Stories")).toHaveAttribute("href", "#/stories");
    await userEvent.click(navLink("Stories"));
    await waitFor(() => expect(navLink("Stories")).toHaveAttribute("aria-current", "page"));
    expect(navLink("Scorecard")).not.toHaveAttribute("aria-current");
    expect(window.location.hash).toBe("#/stories");
    navLink("Raw").focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(navLink("Raw")).toHaveAttribute("aria-current", "page"));
    expect(within(nav).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1);
  });
  it("cycles the theme and remembers it", async () => {
    await open();
    await userEvent.selectOptions(screen.getByTestId("theme-select"), "light");
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.selectOptions(screen.getByTestId("theme-select"), "dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("conflab.theme")).toBe("dark");
    await userEvent.selectOptions(screen.getByTestId("theme-select"), "auto");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("conflab.theme")).toBeNull();
  });
  it("persona picker changes the cast in the story text", async () => {
    await open("Stories");
    expect(screen.getByLabelText("Vertical")).toHaveValue("airlines");
    expect(screen.getByTestId("story")).toHaveTextContent("AirGuard bookings MCP server");
    for (const old of ["Harbor", "Skyline", "Fieldstone", "Meridian"]) expect(screen.getByTestId("story")).not.toHaveTextContent(old);
    await userEvent.selectOptions(screen.getByLabelText("Vertical"), "banking");
    await waitFor(() => expect(screen.getByTestId("story")).toHaveTextContent("Harbor"));
    expect(screen.getByTestId("story")).not.toHaveTextContent("AirGuard");
    expect(screen.getByTestId("story")).not.toHaveTextContent("{{");
  });
  it("skip link, one main landmark and the open section's panel inside it", async () => {
    await open();
    expect(screen.getByText("Skip to content")).toHaveAttribute("href", "#main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("main").querySelector("#panel-scorecard")).not.toBeNull();
  });
  it("shell bar first (brand h1, Mock badge, nav pills, TopMenu), then main with the banner as its first child", async () => {
    await open();
    const bar = document.querySelector("header.shell-bar");
    expect(bar).not.toBeNull();
    expect(document.querySelectorAll("header")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(bar.querySelector(".shell-brand h1")).toHaveTextContent("MCP Auth Conformance LAB");
    expect(within(bar).getByTestId("mode-badge")).toHaveTextContent("Mock");
    expect(bar.querySelector('.shell-nav a[aria-current="page"]')).toHaveTextContent("Scorecard");
    expect(bar.querySelector("[data-testid=top-menu]")).toHaveClass("shell-right");
    expect(bar.compareDocumentPosition(screen.getByRole("main")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("main").firstElementChild).toBe(screen.getByTestId("banner"));
    expect(screen.getByTestId("banner").nextElementSibling).toBe(screen.getByTestId("reset-note"));
    await goLive();
    expect(within(bar).getByTestId("mode-badge")).toHaveTextContent("Live");
    await userEvent.selectOptions(screen.getByTestId("mode-select"), "mock");
    await waitFor(() => expect(within(bar).getByTestId("mode-badge")).toHaveTextContent("Mock"));
  });
  it("Run buttons use aria-disabled, never the disabled attribute, so keyboard focus is kept", async () => {
    await open("Stories");
    expect(screen.getByRole("button", { name: "Run this story" })).not.toBeDisabled();
    await userEvent.click(navLink("Probe"));
    const probe = screen.getByRole("button", { name: "Probe this URL" });
    probe.focus();
    expect(probe).toHaveAttribute("aria-disabled", "true");
    expect(probe).not.toBeDisabled();
    expect(document.activeElement).toBe(probe);
    for (const b of screen.getAllByRole("button")) expect(b, b.textContent).not.toBeDisabled();
  });
});

describe("scorecard", () => {
  it("the good server scores 100% with every defect offered", async () => {
    await open();
    expect(screen.getAllByTestId(/^defect-/).length).toBeGreaterThanOrEqual(10);
    await userEvent.click(screen.getByRole("button", { name: "Score the good server" }));
    await waitFor(() => expect(screen.getByTestId("score")).toHaveTextContent("100%"));
    expect(screen.queryByTestId("failed-must")).toBeNull();
  });
  it("a defect fails its own check with a fix hint, a severity and a spec citation", async () => {
    await open();
    await userEvent.click(screen.getByTestId("defect-missing_prm"));
    await userEvent.click(screen.getByRole("button", { name: /Score with 1 defect/ }));
    await waitFor(() => expect(screen.getByTestId("failed-must")).toHaveTextContent("prm_present"));
    expect(status("prm_present")).toBe("FAIL");
    const box = screen.getByTestId("check-prm_present");
    expect(box).toHaveTextContent("severity high");
    expect(within(box).getByTestId("fix").textContent.length).toBeGreaterThan(10);
    expect(box).toHaveTextContent("RFC 9728");
    expect(Number(screen.getByTestId("score").textContent.replace("%", ""))).toBeLessThan(100);
  });
  it("filters to failures", async () => {
    await open();
    await userEvent.click(screen.getByTestId("defect-no_pkce_s256"));
    await userEvent.click(screen.getByRole("button", { name: /Score with 1 defect/ }));
    await screen.findByTestId("check-list");
    await userEvent.selectOptions(screen.getByLabelText("Show"), "fail");
    const items = screen.getAllByTestId(/^check-/).filter((e) => e.tagName === "DETAILS");
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(i).toHaveTextContent("FAIL");
  });
  it("Reset clears the scorecard and the story run", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Score the good server" }));
    await screen.findByTestId("score");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByTestId("no-card")).toBeInTheDocument());
    expect(screen.getByTestId("reset-note")).toHaveTextContent("starting positions");
  });
});

describe("stories", () => {
  const runStory = async (id) => {
    await open("Stories");
    await userEvent.selectOptions(screen.getByLabelText("Story"), id);
    await userEvent.click(screen.getByRole("button", { name: "Run this story" }));
    await screen.findByTestId("scenario-result");
  };
  it("steps through a story and shows the takeaway", async () => {
    await open("Stories");
    expect(screen.getByTestId("step-count")).toHaveTextContent(/\d+ steps/);
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByTestId("step-count")).toHaveTextContent("Step 1 of");
    expect(document.querySelector("[aria-current='step']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Previous step" })).toHaveAttribute("aria-disabled", "true");
  });
  it("good server story behaves as told", async () => {
    await runStory("S01");
    expect(screen.getByTestId("scenario-verdict")).toHaveTextContent("Behaved as the story says");
    expect(screen.getByTestId("score")).toHaveTextContent("100%");
  });
  it("a defect story fails exactly the check it names", async () => {
    await runStory("S02");
    expect(screen.getByTestId("scenario-verdict")).toHaveTextContent("Behaved as the story says");
    expect(screen.getByTestId("failed-must")).toHaveTextContent("prm_present");
  });
  it("the 401 then 403 step-up path reaches 200", async () => {
    await runStory("S15");
    expect(screen.getByTestId("stepup-outcome")).toHaveTextContent("stepped_up");
    expect(screen.getByText(/401 then 403 then 200/)).toBeInTheDocument();
  });
  it("DCR versus CIMD compares three servers", async () => {
    await runStory("S14");
    expect(within(screen.getByTestId("compare-table")).getAllByRole("row")).toHaveLength(4);
  });
  it("probe guards: private addresses refused and cross-origin redirect blocked", async () => {
    await runStory("S18");
    expect(screen.getByTestId("refusal-table")).toHaveTextContent("address_blocked");
    cleanup();
    await runStory("S19");
    expect(screen.getByTestId("redirect-blocked")).toHaveTextContent("cross_origin_redirect");
  });
  it("a wildcard gateway story runs", async () => {
    await runStory("S13");
    expect(screen.getByTestId("scenario-verdict")).toHaveTextContent("Behaved as the story says");
  });
});

describe("probe", () => {
  it("in Mock mode the probe is refused with an honest message and sends nothing, even when forced", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await open("Probe");
    expect(screen.getByTestId("probe-mock-note")).toHaveTextContent("header is on Mock, so nothing can be sent");
    await userEvent.type(screen.getByLabelText("Target MCP endpoint URL"), "http://127.0.0.1:4930/mcp");
    await userEvent.click(screen.getByTestId("probe-confirm"));
    const btn = screen.getByRole("button", { name: "Probe this URL" });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(btn);
    expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith("/api/probe"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Switch to Real" }));
    await waitFor(() => expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live"));
    expect(screen.queryByTestId("probe-mock-note")).toBeNull();
    expect(screen.getByRole("button", { name: "Probe this URL" })).toHaveAttribute("aria-disabled", "false");
    fetchSpy.mockRestore();
  });
  it("is gated in Live mode: nothing can be sent until the confirmation is ticked", async () => {
    await open("Probe"); await goLive();
    expect(screen.getByTestId("probe-mode-note")).toHaveTextContent("External probing is OFF");
    await userEvent.type(screen.getByLabelText("Target MCP endpoint URL"), "http://127.0.0.1:4930/mcp");
    const btn = screen.getByRole("button", { name: "Probe this URL" });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByTestId("probe-confirm"));
    expect(btn).toHaveAttribute("aria-disabled", "false");
  });
  it("refuses an external or private target and says why", async () => {
    await open("Probe"); await goLive();
    for (const [url, reason] of [["https://mcp.example/mcp", "external_probe_disabled"], ["http://10.0.0.5/mcp", "scheme_not_https"]]) {
      const input = screen.getByLabelText("Target MCP endpoint URL");
      await userEvent.clear(input); await userEvent.type(input, url);
      if (!screen.getByTestId("probe-confirm").checked) await userEvent.click(screen.getByTestId("probe-confirm"));
      await userEvent.click(screen.getByRole("button", { name: "Probe this URL" }));
      await waitFor(() => expect(screen.getByTestId("probe-refusal")).toHaveTextContent(reason));
    }
  });
  it("scores a local mock and lists every request it sent", async () => {
    const srv = await startMockServer({ defects: ["no_pkce_s256"], vertical: "airlines" });
    try {
      await open("Probe"); await goLive();
      await userEvent.type(screen.getByLabelText("Target MCP endpoint URL"), srv.mock.resource);
      await userEvent.click(screen.getByTestId("probe-confirm"));
      await userEvent.click(screen.getByRole("button", { name: "Probe this URL" }));
      await waitFor(() => expect(screen.getByTestId("failed-must")).toHaveTextContent("pkce_s256"));
      expect(screen.getByTestId("probe-log").textContent).toContain("/mcp");
      expect(status("pkce_s256")).toBe("FAIL");
      expect(screen.getByText(/not run against a probe target/)).toBeInTheDocument();
    } finally { await srv.close(); }
  });
});

describe("clients and raw", () => {
  it("labels what it could not verify and makes no claim there", async () => {
    await open("Clients");
    await screen.findByTestId("client-spec");
    expect(within(screen.getByTestId("client-spec")).getByText("verified")).toBeInTheDocument();
    expect(within(screen.getByTestId("client-claude")).getByText("UNVERIFIED")).toBeInTheDocument();
  });
  it("shows raw requests with a traceparent after a scan", async () => {
    await open("Raw");
    expect(screen.getByTestId("raw-empty")).toBeInTheDocument();
    await userEvent.click(navLink("Scorecard"));
    await userEvent.click(screen.getByRole("button", { name: "Score the good server" }));
    await screen.findByTestId("score");
    await userEvent.click(navLink("Raw"));
    expect(screen.getByTestId("raw-traceparent").textContent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(screen.getByTestId("raw-response")).toHaveTextContent("401");
  });
  it("shows each message through the shared JSON pane: Form | JSON, the exact JSON one click away", async () => {
    setJsonView("form");
    await open("Scorecard");
    await userEvent.click(screen.getByRole("button", { name: "Score the good server" }));
    await screen.findByTestId("score");
    await userEvent.click(navLink("Raw"));
    const toggle = within(screen.getByTestId("raw-response-box")).getByRole("group", { name: "Response view" });
    expect(within(toggle).getAllByRole("button").map((b) => b.textContent)).toEqual(["Form", "JSON"]);
    expect(screen.getByTestId("raw-response").tagName).toBe("DIV");
    expect(screen.getByTestId("raw-response")).toHaveTextContent("401");
    // the bodies are JSON text: each gets its own pane (not escaped text inside the message pane)
    expect(screen.getByTestId("raw-request-body").tagName).toBe("DIV");
    expect(screen.getByTestId("raw-request-body")).toHaveTextContent("jsonrpc");
    expect(screen.getByTestId("raw-response-body")).toHaveTextContent("unauthorized");
    expect(screen.getByTestId("raw-response")).not.toHaveTextContent("unauthorized");
    await userEvent.click(within(toggle).getByRole("button", { name: "JSON" }));
    expect(screen.getByTestId("raw-response").tagName).toBe("PRE");
    expect(screen.getByTestId("raw-response")).toHaveTextContent('"status": 401');
    expect(screen.getByTestId("raw-request")).toHaveTextContent('"method"');
  });
});

describe("diagram in the app", () => {
  it("simulates from the scan on screen and Reset clears the simulation", async () => {
    await open("Scorecard");
    await userEvent.click(screen.getByRole("button", { name: "Score the good server" }));
    await screen.findByTestId("score");
    await userEvent.click(navLink("Diagram"));
    await screen.findByTestId("caption");
    expect(screen.getByTestId("caption")).toHaveTextContent("requests from the scorecard");
    await userEvent.click(screen.getByRole("button", { name: "Simulate" }));
    expect(screen.getByTestId("caption")).toHaveTextContent("Step 1 of");
    await userEvent.click(screen.getAllByRole("button", { name: "Reset" }).at(-1));
    expect(screen.getByTestId("caption")).toHaveTextContent("Press Simulate");
  });
});

describe("header Reset, banner and draggable boxes", () => {
  it("the header Reset tells the server to reset and says the boxes are back", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await open("Diagram");
    await userEvent.click(screen.getAllByRole("button", { name: "Reset" })[0]);
    await waitFor(() => expect(screen.getByTestId("reset-note")).toHaveTextContent("starting positions"));
    expect(fetchSpy.mock.calls.some(([u, init]) => String(u).endsWith("/api/reset") && init?.method === "POST")).toBe(true);
    fetchSpy.mockRestore();
  });

  it("the header Reset puts moved diagram boxes back and clears the simulation (not only the Diagram tab's own Reset)", async () => {
    await open("Diagram");
    await waitFor(() => expect(document.querySelectorAll(".react-flow__node").length).toBe(6));
    const first = () => document.querySelector(".react-flow__node");
    const where = () => first().style.transform;
    const start = where();
    expect(start).toMatch(/translate/);
    // Move the first box with the keyboard (select it, then arrow keys), then start a simulation.
    first().focus();
    await userEvent.keyboard("{Enter}{ArrowRight}{ArrowRight}{ArrowDown}");
    await waitFor(() => expect(where()).not.toBe(start));
    await userEvent.click(screen.getByRole("button", { name: "Simulate" }));
    expect(screen.getByTestId("caption")).toHaveTextContent("Step 1 of");
    // The header Reset is the first Reset button on the page; the Diagram tab's own is the last.
    const resets = screen.getAllByRole("button", { name: "Reset" });
    expect(resets.length).toBe(2);
    await userEvent.click(resets[0]);
    await waitFor(() => expect(where()).toBe(start));
    expect(screen.getByTestId("caption")).toHaveTextContent("Press Simulate");
  });

  it("the banner sits outside every admin-only block, so presenter mode never hides it", async () => {
    await open("Diagram");
    expect(screen.getByTestId("banner").closest("[data-admin-only]")).toBeNull();
  });

  it("every diagram box stays draggable, and the boxes come from the diagram data the server serves", async () => {
    await open("Diagram");
    await waitFor(() => expect(document.querySelectorAll(".react-flow__node").length).toBe(6));
    for (const n of document.querySelectorAll(".react-flow__node")) expect(n.classList.contains("draggable")).toBe(true);
  });
});
