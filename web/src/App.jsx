import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShelfLink from "./components/ShelfLink.jsx";
import { getCatalog, getDiagram, resetServer } from "./lib/api.js";
import { boxesFromDiagram } from "./lib/diagram.js";
import { fill } from "./lib/fill.js";
import ScorecardTab from "./tabs/ScorecardTab.jsx";
import StoriesTab from "./tabs/StoriesTab.jsx";
import ProbeTab from "./tabs/ProbeTab.jsx";
import ClientsTab from "./tabs/ClientsTab.jsx";
import DiagramTab from "./tabs/DiagramTab.jsx";
import RawTab from "./tabs/RawTab.jsx";

export const TABS = [["scorecard", "Scorecard"], ["stories", "Stories"], ["probe", "Probe"], ["clients", "Clients"], ["diagram", "Diagram"], ["raw", "Raw"]];
// Shown until the server's per-mode banner arrives; it never claims one mode before it knows.
export const BANNER_UNKNOWN = "Simulated unless the header says Live. Targets are in-process mock MCP servers: no tenant, no outbound network. Loading the lab...";
const LIVE_NOTE = "Live mode applies to the Probe tab. This tab still uses simulated in-process mock servers.";
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } };
const tabFromHash = () => { const id = window.location.hash.replace(/^#\/?/, "").split("?")[0]; return TABS.some(([t]) => t === id) ? id : "scorecard"; };

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState(tabFromHash);
  const [theme, setTheme] = useState(() => (["light", "dark"].includes(read("conflab.theme", "")) ? read("conflab.theme", "") : "auto"));
  const [present, setPresent] = useState(() => read("conflab.present", "0") === "1");
  const [mode, setModeState] = useState(() => (read("conflab.mode", "mock") === "live" ? "live" : "mock"));

  const setMode = useCallback((m) => { setModeState(m); write("conflab.mode", m); }, []);
  const togglePresent = useCallback(() => setPresent((p) => { write("conflab.present", p ? "0" : "1"); return !p; }), []);

  useEffect(() => { getCatalog().then(setCatalog).catch((e) => setLoadError(e.message)); }, []);
  useEffect(() => { const on = () => setTab(tabFromHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  useEffect(() => { if (theme === "auto") { try { localStorage.removeItem("conflab.theme"); } catch { /* not remembered */ } delete document.documentElement.dataset.theme; } else { try { localStorage.setItem("conflab.theme", theme); } catch { /* not remembered */ } document.documentElement.dataset.theme = theme; } }, [theme]);
  useEffect(() => { if (present) document.documentElement.dataset.present = "1"; else delete document.documentElement.dataset.present; }, [present]);
  useEffect(() => { document.documentElement.dataset.mode = mode; }, [mode]);

  // Presenter mode: P toggles, Esc leaves. Keys with Ctrl, Cmd or Alt held belong to the browser, and typing in a field is never a shortcut.
  useEffect(() => {
    const on = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "p" || e.key === "P") togglePresent();
      else if (e.key === "Escape") setPresent((p) => { if (p) write("conflab.present", "0"); return false; });
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [togglePresent]);

  // The banner is outside every tab and outside [data-admin-only], so presenter mode never hides it. It shows the mode in the header.
  const banner = catalog?.banner?.[mode] || BANNER_UNKNOWN;
  const shell = (body) => (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <div className="banner" role="note" data-state={mode} data-testid="banner">{banner}</div>
      {body}
    </>
  );
  if (loadError) return shell(<main className="page" id="main" tabIndex={-1}><p className="alert" role="alert">Could not reach the lab server: {loadError}</p></main>);
  if (!catalog) return shell(<main className="page" id="main" tabIndex={-1}><p className="muted" role="status">Loading the lab...</p></main>);
  return shell(<Shell catalog={catalog} tab={tab} theme={theme} setTheme={setTheme} present={present} togglePresent={togglePresent} mode={mode} setMode={setMode} />);
}

function Shell({ catalog, tab, theme, setTheme, present, togglePresent, mode, setMode }) {
  const [vertical, setVertical] = useState(catalog.verticals[0].id);
  const [card, setCard] = useState(null);
  const [scenarioId, setScenarioId] = useState(catalog.scenarios[0].id);
  const [scenarioRun, setScenarioRun] = useState(null);
  const [cursor, setCursor] = useState(-1);
  const [sim, setSim] = useState(-1);
  const [diagram, setDiagram] = useState(null);
  const [diagramError, setDiagramError] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [resetNote, setResetNote] = useState("");
  const tabRefs = useRef({});

  // The diagram is diagram-studio/1 data, loaded by name from the server (rule 17).
  useEffect(() => {
    let live = true;
    getDiagram(catalog.diagrams[0]).then((d) => { if (live) { setDiagram(d); setBoxes(boxesFromDiagram(d)); } }, (e) => { if (live) setDiagramError(e.message); });
    return () => { live = false; };
  }, [catalog]);

  const cast = useMemo(() => catalog.verticals.find((v) => v.id === vertical)?.cast || {}, [catalog, vertical]);
  const pickVertical = useCallback((id) => { setVertical(id); setScenarioRun(null); setCursor(-1); }, []);
  const resetBoxes = useCallback(() => setBoxes(boxesFromDiagram(diagram)), [diagram]);
  const resetAll = useCallback(async () => {
    try {
      await resetServer();
      setCard(null); setScenarioRun(null); setCursor(-1); setSim(-1); resetBoxes();
      setResetNote("Reset: the scorecard, the story run and the diagram are back to their starting state, and the boxes are back in their starting positions.");
    } catch (e) { setResetNote(`Reset failed: ${e.message}`); }
  }, [resetBoxes]);

  const setThemePersist = (t) => { setTheme(t); };
  const go = (id) => { window.location.hash = `#/${id}`; };
  const onTabKey = (e) => {
    const focused = TABS.findIndex(([id]) => tabRefs.current[id] === document.activeElement);
    const i = focused >= 0 ? focused : TABS.findIndex(([id]) => id === tab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const [id] = TABS[(to + TABS.length) % TABS.length];
    go(id); tabRefs.current[id]?.focus();
  };

  const app = { catalog, cast, vertical, card, setCard, scenarioId, setScenarioId, scenarioRun, setScenarioRun, cursor, setCursor, sim, setSim, boxes, setBoxes, diagram, diagramError, resetBoxes, theme, present, mode, setMode, go };
  const Panel = { scorecard: ScorecardTab, stories: StoriesTab, probe: ProbeTab, clients: ClientsTab, diagram: DiagramTab, raw: RawTab }[tab];

  return (
    <>
      <header className="top">
        <h1><span className="mark" aria-hidden="true">AUTH</span> MCP Auth Conformance LAB</h1>
        <div className="tools-right">
            <ShelfLink />
          <div className="seg" role="group" aria-label="Mode">
            <button type="button" aria-pressed={mode === "mock"} onClick={() => setMode("mock")} data-testid="mode-mock">Mock</button>
            <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")} data-testid="mode-live">Live</button>
          </div>
          <span className="mode-chip" data-testid="mode">Mode: {mode}{mode === "live" ? " (Probe tab)" : " (simulated)"}</span>
          <label className="inline">Persona
            <select value={vertical} onChange={(e) => pickVertical(e.target.value)} aria-label="Persona and vertical">
              {catalog.verticals.map((v) => <option key={v.id} value={v.id}>{v.name}: {v.cast.org}</option>)}
            </select>
          </label>
          <button type="button" onClick={resetAll}>Reset</button>
          <button type="button" aria-pressed={present} onClick={togglePresent} title="Presenter mode: P to turn on, Esc to leave">Present</button>
          <label className="inline">Theme
            <select value={theme} onChange={(e) => setThemePersist(e.target.value)} data-testid="theme">
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>
      <p className="muted page reset-note" role="status" data-testid="reset-note">{resetNote}</p>
      <div className="tabbar" role="tablist" aria-label="Sections" onKeyDown={onTabKey}>
        {TABS.map(([id, label]) => (
          <button key={id} id={`tab-${id}`} ref={(el) => { tabRefs.current[id] = el; }} type="button" role="tab" aria-selected={id === tab} aria-controls={`panel-${id}`} tabIndex={id === tab ? 0 : -1} className="tab" onClick={() => go(id)}>{label}</button>
        ))}
      </div>
      <main className="page" id="main" tabIndex={-1}>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          <p className="lede" data-admin-only>{fill("Score {{server}} for {{org}} against the MCP authorization expectations, with the evidence, the severity, a fix and the spec behind every check. Switch the persona to change the cast.", cast)}</p>
          {mode === "live" && tab !== "probe" && <p className="note" data-testid="live-note">{LIVE_NOTE}</p>}
          <Panel app={app} />
        </div>
      </main>
    </>
  );
}
