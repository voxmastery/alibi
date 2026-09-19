/** The Network screen: the vendor base drawn as a graph, one month at a time.
 *
 * Three things happen here. The canvas draws whatever the layout currently holds. The scrubber asks
 * the API for another month and hands the result to the layout, which patches it into the nodes
 * already on screen so the picture recolours instead of re-settling. The connections panel says the
 * same thing in sentences, for readers who would rather not squint at circles.
 */

import type { Band, EdgeAttribute, NetworkConnection, NetworkGraph, NetworkNode } from "@alibi/contracts";
import { getNetwork } from "../api.js";
import {
  ATTRIBUTE_ORDER,
  BAND_COLOURS,
  EDGE_STYLES,
  createSurface,
  nodeAt,
  type Surface,
} from "../network/canvas2d.js";
import { createLayout } from "../network/layout2d.js";
import type { LayoutNode } from "../network/layout2d.js";
import type { AppContext, Cleanup, Screen } from "../state.js";
import { bandPill, button, emptyState, errorBox, pageHeader, sampleBadge } from "../ui/components.js";
import { el, link } from "../ui/dom.js";
import type { Child } from "../ui/dom.js";
import { monthLabel } from "../ui/format.js";

const LEDE =
  "Your vendor base, drawn by what the record shows they share: a bank account, an address, a phone " +
  "number, an email, a filing address. Move through the months to see how the picture changed.";
const CANVAS_LABEL =
  "Vendor network. Each circle is a vendor, sized by purchase value and coloured by band. Each line " +
  "is an attribute two vendors share. The connections listed below say the same thing in words.";
const LEGEND_NOTE =
  "Node size is purchase value. Rings mark vendors linked to two or more others by two or more " +
  "shared attributes.";
const CONNECTIONS_TITLE = "Connections worth a look";
const NO_CONNECTIONS = "No shared attributes among vendors on record for this month.";
const PANEL_TITLE = "Vendor base";
const READ_FAILED = "The network could not be read.";

const BAND_WORDS: Record<Band, string> = {
  clear: "Clear",
  watch: "Watch",
  flagged: "Flagged",
  unknown: "Unknown",
};

const ATTRIBUTE_WORDS: Record<EdgeAttribute, string> = {
  bank_account: "Shared bank account",
  address: "Shared address",
  filing_ip: "Shared filing address",
  phone: "Shared phone",
  email: "Shared email",
  pan: "Shared PAN",
};

const PLAY_INTERVAL_MS = 900;
/** A dragged range input fires a flood of events; one fetch per resting position is enough. */
const SLIDE_DEBOUNCE_MS = 90;
const DEFAULT_PANEL_WIDTH = 960;
const DEFAULT_PANEL_HEIGHT = 600;
const TOOLTIP_OFFSET = 14;
const TOOLTIP_WIDTH = 220;
const TOOLTIP_HEIGHT = 96;

function clampIndex(value: number, last: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(last, Math.max(0, Math.round(value)));
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : READ_FAILED;
}

/** How many vendors the record actually holds for the month on screen. */
function onRecord(graph: NetworkGraph): number {
  return graph.nodes.filter((node) => node.exists).length;
}

// ---------------------------------------------------------------------------- connections panel

interface NamedVendor {
  id: string;
  name: string;
}

/**
 * Wraps each vendor name found in a sentence in a link to that vendor, leaving the rest of the
 * sentence exactly as the API wrote it. Longer names win at the same position so "Kumar Metals
 * Private Limited" is never split by a shorter "Kumar Metals".
 */
export function linkifySentence(sentence: string, vendors: NamedVendor[]): Child[] {
  const named = vendors.filter((vendor) => vendor.name.length > 0);
  const out: Child[] = [];
  let cursor = 0;
  while (cursor < sentence.length) {
    let hit: { at: number; vendor: NamedVendor } | null = null;
    for (const vendor of named) {
      const at = sentence.indexOf(vendor.name, cursor);
      if (at < 0) continue;
      if (!hit || at < hit.at || (at === hit.at && vendor.name.length > hit.vendor.name.length)) {
        hit = { at, vendor };
      }
    }
    if (!hit) {
      out.push(sentence.slice(cursor));
      break;
    }
    if (hit.at > cursor) out.push(sentence.slice(cursor, hit.at));
    out.push(link(`/vendors/${encodeURIComponent(hit.vendor.id)}`, hit.vendor.name));
    cursor = hit.at + hit.vendor.name.length;
  }
  return out;
}

function connectionVendors(connection: NetworkConnection, names: Map<string, string>): NamedVendor[] {
  return connection.vendor_ids.map((id) => ({ id, name: names.get(id) ?? "" }));
}

function connectionsPanel(graph: NetworkGraph): HTMLElement {
  if (graph.connections.length === 0) return emptyState(NO_CONNECTIONS);
  const names = new Map(graph.nodes.map((node) => [node.id, node.legal_name] as const));
  return el(
    "ul",
    { class: "connection-list" },
    graph.connections.map((connection) =>
      el(
        "li",
        { class: "connection", dataset: { attribute: connection.attribute } },
        linkifySentence(connection.sentence, connectionVendors(connection, names)),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------- legend

function bandSwatch(band: Band): HTMLElement {
  const dot = el("span", { class: "legend-dot" });
  dot.style.background = BAND_COLOURS[band];
  return el("span", { class: "legend-item" }, dot, el("span", null, BAND_WORDS[band]));
}

function attributeSample(attribute: EdgeAttribute): HTMLElement {
  const style = EDGE_STYLES[attribute];
  const line = el("span", { class: "legend-line" });
  line.style.borderTopWidth = `${style.width}px`;
  line.style.borderTopColor = style.colour;
  return el("span", { class: "legend-item" }, line, el("span", null, ATTRIBUTE_WORDS[attribute]));
}

function buildLegend(): HTMLElement {
  const bands: Band[] = ["clear", "watch", "flagged", "unknown"];
  return el(
    "div",
    { class: "network-legend" },
    el("div", { class: "legend-row" }, bands.map(bandSwatch)),
    el("div", { class: "legend-row" }, ATTRIBUTE_ORDER.map(attributeSample)),
    el("p", { class: "legend-note muted" }, LEGEND_NOTE),
  );
}

// ---------------------------------------------------------------------------- canvas view

function tooltipContent(node: LayoutNode): HTMLElement[] {
  return [
    el("p", { class: "tt-name" }, node.legal_name),
    el("p", { class: "tt-gstin mono" }, node.gstin),
    el(
      "p",
      { class: "tt-meta" },
      bandPill(node.band),
      el("span", null, node.score === null ? "No score on record" : `Score ${node.score}`),
    ),
  ];
}

function placeTooltip(tooltip: HTMLElement, node: LayoutNode, x: number, y: number, surface: Surface): void {
  tooltip.replaceChildren(...tooltipContent(node));
  tooltip.hidden = false;
  const overflowsRight = x + TOOLTIP_OFFSET + TOOLTIP_WIDTH > surface.width;
  const left = overflowsRight ? x - TOOLTIP_OFFSET - TOOLTIP_WIDTH : x + TOOLTIP_OFFSET;
  tooltip.style.left = `${Math.max(0, left)}px`;
  tooltip.style.top = `${Math.max(0, Math.min(y + TOOLTIP_OFFSET, surface.height - TOOLTIP_HEIGHT))}px`;
}

interface GraphView {
  apply(graph: NetworkGraph): void;
  resize(): void;
  stop(): void;
}

function createGraphView(
  canvas: HTMLCanvasElement,
  tooltip: HTMLElement,
  navigate: (path: string) => void,
): GraphView {
  const surface = createSurface(canvas);
  const layout = createLayout(DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT);
  let hoveredId: string | null = null;

  const draw = (): void => surface.draw({ nodes: layout.nodes(), edges: layout.edges(), hoveredId });
  layout.tick(draw);

  const pointOf = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener("pointermove", (event) => {
    const { x, y } = pointOf(event);
    const hit = nodeAt(layout.nodes(), x, y);
    canvas.style.cursor = hit ? "pointer" : "default";
    if (hit) placeTooltip(tooltip, hit, x, y, surface);
    else tooltip.hidden = true;
    const nextId = hit?.id ?? null;
    if (nextId !== hoveredId) {
      hoveredId = nextId;
      draw();
    }
  });

  canvas.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    canvas.style.cursor = "default";
    if (hoveredId === null) return;
    hoveredId = null;
    draw();
  });

  canvas.addEventListener("click", (event) => {
    const { x, y } = pointOf(event);
    const hit = nodeAt(layout.nodes(), x, y);
    if (hit) navigate(`/vendors/${encodeURIComponent(hit.id)}`);
  });

  return {
    apply: (graph) => {
      layout.setGraph(graph.nodes, graph.edges);
      draw();
    },
    resize: () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      surface.resize(rect.width, rect.height);
      layout.resize(rect.width, rect.height);
      draw();
    },
    stop: () => layout.stop(),
  };
}

// ---------------------------------------------------------------------------- scrubber

interface Scrubber {
  element: HTMLElement;
  /** Refreshes the trailing vendor count once the month's data lands. */
  setCount(count: number): void;
  stop(): void;
}

function createScrubber(
  months: string[],
  startIndex: number,
  startCount: number,
  onMonth: (month: string) => void,
): Scrubber {
  const last = Math.max(0, months.length - 1);
  const single = months.length <= 1;
  let index = clampIndex(startIndex, last);
  let count = startCount;
  let timer: number | null = null;
  let debounce: number | null = null;

  const monthAt = (at: number): string => months[at] ?? months[last] ?? "";
  const label = el("span", { class: "network-month", dataset: { testid: "scrubber-label" } });
  const slider = el("input", {
    type: "range",
    class: "scrubber",
    min: "0",
    max: String(last),
    step: "1",
    value: String(index),
    "aria-label": "Month on record",
    disabled: single,
    dataset: { testid: "scrubber" },
  });
  const play = button("Play", { class: "btn-secondary", disabled: single, dataset: { testid: "play" } });

  const paint = (): void => {
    label.textContent = `${monthLabel(monthAt(index))} · ${count} vendors on record`;
  };

  const goTo = (next: number): void => {
    index = clampIndex(next, last);
    slider.value = String(index);
    // The month reads true immediately; the count follows when the API answers.
    paint();
    if (debounce !== null) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      debounce = null;
      onMonth(monthAt(index));
    }, SLIDE_DEBOUNCE_MS);
  };

  const stopPlay = (): void => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    play.textContent = "Play";
    play.setAttribute("aria-pressed", "false");
  };

  const startPlay = (): void => {
    if (index >= last) goTo(0);
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    timer = window.setInterval(() => {
      if (index >= last) {
        stopPlay();
        return;
      }
      goTo(index + 1);
    }, PLAY_INTERVAL_MS);
  };

  slider.addEventListener("input", () => goTo(Number(slider.value)));
  play.addEventListener("click", () => (timer === null ? startPlay() : stopPlay()));
  play.setAttribute("aria-pressed", "false");
  paint();

  return {
    element: el("div", { class: "network-controls" }, label, slider, play),
    setCount: (next) => {
      count = next;
      paint();
    },
    stop: () => {
      stopPlay();
      if (debounce !== null) window.clearTimeout(debounce);
      debounce = null;
    },
  };
}

// ---------------------------------------------------------------------------- screen

function isSample(graph: NetworkGraph, ctx: AppContext): boolean {
  return ctx.mode.sample || graph.nodes.some((node: NetworkNode) => node.source === "sample");
}

function mount(host: HTMLElement, graph: NetworkGraph, ctx: AppContext): Cleanup {
  const openMonth = graph.as_of.slice(0, 7);
  const months = graph.months.length > 0 ? graph.months : [openMonth];
  const startIndex = Math.max(0, months.indexOf(openMonth));

  const canvas = el("canvas", { class: "network-canvas", role: "img", "aria-label": CANVAS_LABEL });
  const tooltip = el("div", { class: "network-tooltip", hidden: true });
  const panel = el("div", { class: "network-panel" }, canvas, tooltip);
  const connections = el("div", { class: "connections", dataset: { testid: "connections" } });
  const view = createGraphView(canvas, tooltip, ctx.navigate);

  let request = 0;

  function apply(next: NetworkGraph): void {
    view.apply(next);
    scrubber.setCount(onRecord(next));
    connections.replaceChildren(connectionsPanel(next));
  }

  async function load(month: string): Promise<void> {
    const token = ++request;
    try {
      const next = await getNetwork(`${month}-01`);
      // A slower earlier request must never overwrite a later month.
      if (token === request) apply(next);
    } catch (error) {
      if (token === request) connections.replaceChildren(errorBox(readError(error)));
    }
  }

  const scrubber = createScrubber(months, startIndex, onRecord(graph), (month) => void load(month));

  host.append(
    el(
      "section",
      { class: "card network-card" },
      el(
        "div",
        { class: "network-head" },
        el("h2", null, PANEL_TITLE),
        isSample(graph, ctx) ? sampleBadge() : null,
      ),
      scrubber.element,
      panel,
      buildLegend(),
    ),
    el("section", { class: "card" }, el("h2", null, CONNECTIONS_TITLE), connections),
  );

  view.resize();
  apply(graph);

  const observer = new ResizeObserver(() => view.resize());
  observer.observe(canvas);

  return () => {
    observer.disconnect();
    scrubber.stop();
    view.stop();
  };
}

export const networkScreen: Screen = async (root, _params, ctx) => {
  ctx.setTitle("Network");
  const host = el("div", { class: "network" });
  root.append(pageHeader({ eyebrow: "Alibi", title: "Network", lede: LEDE }), host);

  let graph: NetworkGraph;
  try {
    graph = await getNetwork();
  } catch (error) {
    host.append(errorBox(readError(error)));
    return;
  }
  return mount(host, graph, ctx);
};
