/** Drawing the network on a 2D canvas: warm paper, ink-thin edges, band colour only on the nodes.
 *
 * Everything here is geometry and paint. The screen owns the data, the tooltip and the navigation;
 * this module owns the pixels, and it is the only place that knows about devicePixelRatio.
 */

import type { Band, EdgeAttribute } from "@alibi/contracts";
import { communityColour, hasCommunity } from "./communities.js";
import type { LayoutEdge, LayoutNode } from "./layout2d.js";

export interface EdgeStyle {
  /** Stroke width in CSS pixels. */
  width: number;
  colour: string;
}

/** Node fill per risk band. Mirrors the band tokens in styles/tokens.css. */
export const BAND_COLOURS: Record<Band, string> = {
  clear: "#2f8f6b",
  watch: "#c48a1e",
  flagged: "#b23a3a",
  unknown: "#8a857c",
};

/** Edge weight and colour per shared attribute. A shared bank account is the heaviest line drawn. */
export const EDGE_STYLES: Record<EdgeAttribute, EdgeStyle> = {
  bank_account: { width: 3, colour: "#b23a3a" },
  address: { width: 2, colour: "#d98a5f" },
  filing_ip: { width: 2, colour: "#c48a1e" },
  phone: { width: 1.5, colour: "#6f8fd6" },
  email: { width: 1.5, colour: "#8f7fd6" },
  pan: { width: 1, colour: "#b9b2a6" },
};

/** The order attributes appear in the legend: heaviest signal first. */
export const ATTRIBUTE_ORDER: readonly EdgeAttribute[] = [
  "bank_account",
  "address",
  "filing_ip",
  "phone",
  "email",
  "pan",
];

const TAU = Math.PI * 2;
const PAPER = "#fdfcf9";
const INK = "#1c1b19";
const NODE_EDGE = "rgba(28, 27, 25, 0.28)";
const EDGE_ALPHA = 0.7;
/** Vendors not on the record for the chosen month stay visible, but only just. */
const ABSENT_ALPHA = 0.3;
const COMMUNITY_RING_GAP = 3.5;
const COMMUNITY_RING_WIDTH = 2;
const COMMUNITY_HALO_GAP = 7.5;
const COMMUNITY_HALO_WIDTH = 3;
const COMMUNITY_HALO_ALPHA = 0.3;
const LABEL_FONT = '11px "Source Sans 3", system-ui, -apple-system, sans-serif';
const LABEL_GAP = 4;
const LABEL_MAX_CHARS = 22;
const LABEL_HALO_WIDTH = 3;
const LABEL_LINE_HEIGHT = 13;
/** Breathing room around a label when deciding whether it lands on top of another. */
const LABEL_PADDING = 3;
/** Fingers and mice are imprecise; give small circles a little more to aim at. */
const HIT_PADDING = 4;
const MAX_PIXEL_RATIO = 3;

export interface DrawState {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  hoveredId: string | null;
}

export interface Surface {
  /** Panel width in CSS pixels. */
  readonly width: number;
  /** Panel height in CSS pixels. */
  readonly height: number;
  /** Sizes the backing store for the current display density. */
  resize(width: number, height: number): void;
  draw(state: DrawState): void;
}

function endpoint(value: LayoutEdge["source"]): LayoutNode | null {
  return typeof value === "object" && value !== null ? (value as LayoutNode) : null;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}...`;
}

/** The vendor under a pointer at (x, y) in CSS pixels, or null. Nearest centre wins. */
export function nodeAt(nodes: LayoutNode[], x: number, y: number): LayoutNode | null {
  let best: LayoutNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const distance = Math.hypot(x - (node.x ?? 0), y - (node.y ?? 0));
    if (distance <= node.radius + HIT_PADDING && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

/** True when a node earns a permanent label: anything the reader should not have to hunt for. */
function labelled(node: LayoutNode, hoveredId: string | null): boolean {
  return node.band !== "clear" || node.id === hoveredId;
}

/** Which label survives when two land on the same spot: the one the reader needs more. */
const LABEL_PRIORITY: Record<Band, number> = { flagged: 0, watch: 1, unknown: 2, clear: 3 };

function labelOrder(nodes: LayoutNode[], hoveredId: string | null): LayoutNode[] {
  return nodes
    .filter((node) => labelled(node, hoveredId))
    .sort((a, b) => {
      if (a.id === hoveredId) return -1;
      if (b.id === hoveredId) return 1;
      const byBand = LABEL_PRIORITY[a.band] - LABEL_PRIORITY[b.band];
      return byBand !== 0 ? byBand : b.radius - a.radius;
    });
}

interface LabelBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The square a node occupies, rings included, so a label never lands on somebody else's circle. */
function nodeBox(node: LayoutNode): LabelBox {
  const reach = node.radius + COMMUNITY_HALO_GAP;
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  return { left: x - reach, right: x + reach, top: y - reach, bottom: y + reach };
}

export function createSurface(canvas: HTMLCanvasElement): Surface {
  let width = 1;
  let height = 1;
  let ratio = 1;

  function drawEdges(ctx: CanvasRenderingContext2D, edges: LayoutEdge[]): void {
    for (const edge of edges) {
      const source = endpoint(edge.source);
      const target = endpoint(edge.target);
      if (!source || !target) continue;
      const style = EDGE_STYLES[edge.attribute];
      ctx.globalAlpha = source.exists && target.exists ? EDGE_ALPHA : ABSENT_ALPHA * EDGE_ALPHA;
      ctx.strokeStyle = style.colour;
      ctx.lineWidth = style.width;
      ctx.beginPath();
      ctx.moveTo(source.x ?? 0, source.y ?? 0);
      ctx.lineTo(target.x ?? 0, target.y ?? 0);
      ctx.stroke();
    }
  }

  function drawNode(ctx: CanvasRenderingContext2D, node: LayoutNode, hovered: boolean): void {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const alpha = node.exists ? 1 : ABSENT_ALPHA;

    if (hasCommunity(node.community)) {
      const colour = communityColour(node.community);
      ctx.strokeStyle = colour;
      ctx.globalAlpha = alpha * COMMUNITY_HALO_ALPHA;
      ctx.lineWidth = COMMUNITY_HALO_WIDTH;
      ctx.beginPath();
      ctx.arc(x, y, node.radius + COMMUNITY_HALO_GAP, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = COMMUNITY_RING_WIDTH;
      ctx.beginPath();
      ctx.arc(x, y, node.radius + COMMUNITY_RING_GAP, 0, TAU);
      ctx.stroke();
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = BAND_COLOURS[node.band];
    ctx.beginPath();
    ctx.arc(x, y, node.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hovered ? INK : NODE_EDGE;
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.stroke();
  }

  function drawLabels(ctx: CanvasRenderingContext2D, nodes: LayoutNode[], hoveredId: string | null): void {
    ctx.font = LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const placed: LabelBox[] = [];
    const circles = nodes.map((node) => ({ id: node.id, box: nodeBox(node) }));
    for (const node of labelOrder(nodes, hoveredId)) {
      const text = truncate(node.legal_name, LABEL_MAX_CHARS);
      const x = node.x ?? 0;
      const centreY = node.y ?? 0;
      const half = ctx.measureText(text).width / 2 + LABEL_PADDING;
      const below = centreY + node.radius + LABEL_GAP;
      const above = centreY - node.radius - LABEL_GAP - LABEL_LINE_HEIGHT;
      const boxAt = (top: number): LabelBox => ({ left: x - half, right: x + half, top, bottom: top + LABEL_LINE_HEIGHT });
      const clear = (top: number): boolean => {
        const box = boxAt(top);
        return (
          !placed.some((other) => overlaps(box, other)) &&
          !circles.some((circle) => circle.id !== node.id && overlaps(box, circle.box))
        );
      };
      // Below the node by default, above if that spot is taken. A name sitting on another name or
      // another circle reads as neither, so a label with nowhere to go waits for a hover; the
      // hovered node always gets its label, because the tooltip is already next to it.
      const y = node.id === hoveredId ? below : [below, above].find(clear);
      if (y === undefined) continue;
      placed.push(boxAt(y));
      ctx.globalAlpha = node.exists ? 1 : ABSENT_ALPHA;
      ctx.lineWidth = LABEL_HALO_WIDTH;
      ctx.strokeStyle = PAPER;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = INK;
      ctx.fillText(text, x, y);
    }
  }

  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    resize: (nextWidth, nextHeight) => {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      ratio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    },
    draw: ({ nodes, edges, hoveredId }) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      drawEdges(ctx, edges);
      for (const node of nodes) drawNode(ctx, node, node.id === hoveredId);
      drawLabels(ctx, nodes, hoveredId);
      ctx.globalAlpha = 1;
    },
  };
}
