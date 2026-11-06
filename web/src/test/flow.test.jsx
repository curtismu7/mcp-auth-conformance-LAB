import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.jsx";
import { startLive } from "./liveServer.js";
import { startMockServer } from "../../../server/src/mock-http.js";

let live;
beforeAll(async () => { live = await startLive(); });
afterAll(async () => { await live.stop(); });
beforeEach(() => { window.location.hash = "#/scorecard"; document.documentElement.removeAttribute("data-present"); document.documentElement.removeAttribute("data-theme"); try { localStorage.clear(); } catch { /* none */ } });
afterEach(cleanup);

const open = async (tab) => {
  render(<App />);
  await screen.findByRole("tablist");
  if (tab) { await userEvent.click(screen.getByRole("tab", { name: tab })); await waitFor(() => expect(screen.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true")); }
};
const goLive = async () => { await userEvent.click(screen.getByTestId("mode-live")); await waitFor(() => expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live")); };
const status = (id) => within(screen.getByTestId(`check-${id}`)).getAllByText(/^(PASS|FAIL|WARN|NOT TESTED|INFO)$/)[0].textContent;

describe("shell", () => {
  it("shows what is simulated on every tab, including in presenter mode", async () => {
    await open();
    expect(screen.getByTestId("banner")).toHaveTextContent("Simulated (Mock mode)");
    await userEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(document.documentElement.dataset.present).toBe("1");
    for (const t of ["Stories", "Probe", "Clients", "Diagram", "Raw", "Scorecard"]) {
      await userEvent.click(screen.getByRole("tab", { name: t }));
      expect(screen.getByTestId("banner")).toBeVisible();
      expect(screen.getByTestId("banner")).toHaveTextContent("No tenant");
    }
  });
  it("has a Mock | Live toggle in the header on every tab; Mock is the default; the banner and the mode chip follow it", async () => {
    await open();
    expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("mode")).toHaveTextContent("Mode: mock");
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock");
    for (const t of ["Scorecard", "Stories", "Probe", "Clients", "Diagram", "Raw"]) {
      await userEvent.click(screen.getByRole("tab", { name: t }));
      expect(screen.getByTestId("mode-mock")).toBeVisible(); expect(screen.getByTestId("mode-live")).toBeVisible();
    }
    await goLive();
    expect(screen.getByTestId("mode")).toHaveTextContent("Mode: live");
    expect(screen.getByTestId("banner")).toHaveTextContent("Live mode. Only the Probe tab goes live");
    expect(localStorage.getItem("conflab.mode")).toBe("live");
    for (const t of ["Scorecard", "Stories", "Clients", "Diagram", "Raw"]) {
      await userEvent.click(screen.getByRole("tab", { name: t }));
      expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live");
      expect(screen.getByTestId("live-note")).toHaveTextContent("still uses simulated in-process mock servers");
    }
    await userEvent.click(screen.getByRole("tab", { name: "Probe" }));
    expect(screen.queryByTestId("live-note")).toBeNull();
    await userEvent.click(screen.getByTestId("mode-mock"));
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock");
  });
  it("opens in the mode it remembers, and a bad stored value falls back to Mock", async () => {
    localStorage.setItem("conflab.mode", "live");
    render(<App />); await screen.findByRole("tablist");
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live");
    cleanup();
    localStorage.setItem("conflab.mode", "<script>");
    render(<App />); await screen.findByRole("tablist");
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock");
  });
  it("presenter mode: P toggles, Esc leaves, the banner stays, and modifier keys or typing in a field are ignored", async () => {
    await open();
    const down = (init) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init })); });
    down({ key: "p", ctrlKey: true }); down({ key: "p", metaKey: true }); down({ key: "p", altKey: true });
    expect(document.documentElement.dataset.present).toBeUndefined();
    down({ key: "p" });
    expect(document.documentElement.dataset.present).toBe("1");
    expect(screen.getByRole("button", { name: "Present" })).toHaveAttribute("aria-pressed", "true");
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
    await userEvent.selectOptions(screen.getByLabelText("Persona and vertical"), "travel");
    screen.getByLabelText("Persona and vertical").focus();
    await userEvent.keyboard("p");
    expect(document.documentElement.dataset.present).toBeUndefined();
    await userEvent.click(screen.getByRole("tab", { name: "Probe" }));
    await userEvent.type(screen.getByLabelText("Target MCP endpoint URL"), "pp");
    expect(document.documentElement.dataset.present).toBeUndefined();
  });
  it("has the six tabs and moves between them with the arrow keys", async () => {
    await open();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Scorecard", "Stories", "Probe", "Clients", "Diagram", "Raw"]);
    screen.getByRole("tab", { name: "Scorecard" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Stories" })).toHaveAttribute("aria-selected", "true"));
    await userEvent.keyboard("{End}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Raw" })).toHaveAttribute("aria-selected", "true"));
  });
  it("cycles the theme and remembers it", async () => {
    await open();
    await userEvent.selectOptions(screen.getByTestId("theme"), "light");
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.selectOptions(screen.getByTestId("theme"), "dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("conflab.theme")).toBe("dark");
    await userEvent.selectOptions(screen.getByTestId("theme"), "auto");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("conflab.theme")).toBeNull();
  });
  it("persona picker changes the cast in the story text", async () => {
    await open("Stories");
    expect(screen.getByTestId("story")).toHaveTextContent("Harbor");
    await userEvent.selectOptions(screen.getByLabelText("Persona and vertical"), "travel");
    await waitFor(() => expect(screen.getByTestId("story")).toHaveTextContent("Skyline"));
    expect(screen.getByTestId("story")).not.toHaveTextContent("{{");
  });
  it("skip link, the main landmark and the tab panel all exist", async () => {
    await open();
    expect(screen.getByText("Skip to content")).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(within(screen.getByRole("main")).getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Scorecard" })).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
  });
  it("Run buttons use aria-disabled, never the disabled attribute, so keyboard focus is kept", async () => {
    await open("Stories");
    expect(screen.getByRole("button", { name: "Run this story" })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("tab", { name: "Probe" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Switch to Live" }));
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live");
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
    const srv = await startMockServer({ defects: ["no_pkce_s256"], vertical: "banking" });
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
    await userEvent.click(screen.getByRole("tab", { name: "Scorecard" }));
    await userEvent.click(screen.getByRole("button", { name: "Score the good server" }));
    await screen.findByTestId("score");
    await userEvent.click(screen.getByRole("tab", { name: "Raw" }));
    expect(screen.getByTestId("raw-traceparent").textContent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(screen.getByTestId("raw-response")).toHaveTextContent("401");
  });
});

describe("diagram in the app", () => {
  it("simulates from the scan on screen and Reset clears the simulation", async () => {
    await open("Scorecard");
    await userEvent.click(screen.getByRole("button", { name: "Score the good server" }));
    await screen.findByTestId("score");
    await userEvent.click(screen.getByRole("tab", { name: "Diagram" }));
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
