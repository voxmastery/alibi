/** The force layout behind the network view.
 *
 * The one rule this module exists to enforce: a node object outlives the data that made it. When the
 * month scrubber moves, the API returns the same vendors with different fields, and the drawing must
 * recolour in place rather than explode and re-settle. So `setGraph` patches the fields of the node
 * objects it already holds, keeps their `x, y, vx, vy`, and only reheats the simulation gently.
 */

import type { EdgeAttribute, NetworkEdge, NetworkNode } from "@alibi/contracts";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";

/** A vendor in the simulation: the API's node plus the position d3 owns and the radius we draw. */
export interface LayoutNode extends NetworkNode, SimulationNodeDatum {
  radius: number;
}

/** A shared-attribute link. d3 swaps the string ids for node objects when it initialises. */
export interface LayoutEdge extends SimulationLinkDatum<LayoutNode> {
  attribute: EdgeAttribute;
}

export interface Layout {
  /** The live node objects, in the order the API last listed them. */
  nodes(): LayoutNode[];
  /** The live edge objects, with endpoints resolved to node objects. */
  edges(): LayoutEdge[];
  /** Patches in new data, preserving the identity and position of every node id already present. */
  setGraph(nodes: NetworkNode[], edges: NetworkEdge[]): void;
  /** Registers the redraw callback; the latest one wins. */
  tick(cb: () => void): void;
  /** Re-centres the forces for a new panel size. */
  resize(width: number, height: number): void;
  /** Nudges the simulation back into motion without throwing the layout away. */
  reheat(alpha?: number): void;
  stop(): void;
}

export const MIN_NODE_RADIUS = 5;
export const MAX_NODE_RADIUS = 22;

/**
 * Clear space to leave between two linked circles, per shared attribute: a shared bank account pulls
 * vendors far tighter than a shared PAN. The node radii are added on top, so a heavy link between two
 * large vendors still leaves its line visible rather than hiding it under the circles.
 */
const EDGE_GAP: Record<EdgeAttribute, number> = {
  bank_account: 34,
  address: 50,
  filing_ip: 56,
  phone: 72,
  email: 72,
  pan: 92,
};

/** Spring stiffness per shared attribute, on the same ordering as the distances. */
const EDGE_STRENGTH: Record<EdgeAttribute, number> = {
  bank_account: 1,
  address: 0.75,
  filing_ip: 0.7,
  phone: 0.45,
  email: 0.45,
  pan: 0.25,
};

const CHARGE = -210;
const CHARGE_RANGE = 460;
const COLLIDE_PADDING = 5;
const CENTRE_PULL_X = 0.07;
const CENTRE_PULL_Y = 0.09;
const VELOCITY_DECAY = 0.32;
const ALPHA_DECAY = 0.022;
const BOUNDS_PADDING = 6;

/** Heat for the very first graph: there are no positions yet, so let it find them. */
const FIRST_ALPHA = 1;
/** Heat when vendors or links entered or left: new nodes need somewhere to go. */
const STRUCTURE_ALPHA = 0.35;
/** Heat for a plain month change, where only the colours and sizes moved. */
const GENTLE_ALPHA = 0.15;

/** Circle area tracks purchase value, so the radius tracks its square root. */
export function nodeRadius(value: number, maxValue: number): number {
  if (!(maxValue > 0)) return MIN_NODE_RADIUS;
  const share = Math.sqrt(Math.max(0, value)) / Math.sqrt(maxValue);
  return MIN_NODE_RADIUS + (MAX_NODE_RADIUS - MIN_NODE_RADIUS) * Math.min(1, share);
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** The radius of a link endpoint once d3 has resolved it from an id to a node object. */
function endpointRadius(value: LayoutEdge["source"]): number {
  return typeof value === "object" && value !== null ? ((value as LayoutNode).radius ?? MIN_NODE_RADIUS) : MIN_NODE_RADIUS;
}

function edgeKey(edge: NetworkEdge): string {
  return [edge.source, edge.target, edge.attribute].join("|");
}

/** Copies every data field of a fresh API node onto the node object already in the simulation. */
function patchNode(node: LayoutNode, next: NetworkNode, maxValue: number): void {
  node.legal_name = next.legal_name;
  node.gstin = next.gstin;
  node.band = next.band;
  node.score = next.score;
  node.value = next.value;
  node.community = next.community;
  node.source = next.source;
  node.exists = next.exists;
  node.radius = nodeRadius(next.value, maxValue);
}

export function createLayout(width: number, height: number): Layout {
  let panelWidth = Math.max(1, width);
  let panelHeight = Math.max(1, height);

  const byId = new Map<string, LayoutNode>();
  let nodes: LayoutNode[] = [];
  let edges: LayoutEdge[] = [];
  let edgeSignature = "";
  let onTick: (() => void) | null = null;
  let seeded = false;

  const centreX = forceX<LayoutNode>(panelWidth / 2).strength(CENTRE_PULL_X);
  const centreY = forceY<LayoutNode>(panelHeight / 2).strength(CENTRE_PULL_Y);
  const linkForce = forceLink<LayoutNode, LayoutEdge>([])
    .id((node) => node.id)
    .distance((edge) => EDGE_GAP[edge.attribute] + endpointRadius(edge.source) + endpointRadius(edge.target))
    .strength((edge) => EDGE_STRENGTH[edge.attribute]);

  const sim = forceSimulation<LayoutNode, LayoutEdge>()
    .force("charge", forceManyBody<LayoutNode>().strength(CHARGE).distanceMax(CHARGE_RANGE))
    .force("collide", forceCollide<LayoutNode>().radius((node) => node.radius + COLLIDE_PADDING).iterations(2))
    .force("link", linkForce)
    .force("x", centreX)
    .force("y", centreY)
    .velocityDecay(VELOCITY_DECAY)
    .alphaDecay(ALPHA_DECAY)
    .stop();

  /** Keeps every circle inside the panel; a node that drifts off-canvas is a node nobody can read. */
  function clampToPanel(): void {
    for (const node of nodes) {
      const pad = node.radius + BOUNDS_PADDING;
      node.x = clamp(node.x ?? panelWidth / 2, pad, Math.max(pad, panelWidth - pad));
      node.y = clamp(node.y ?? panelHeight / 2, pad, Math.max(pad, panelHeight - pad));
    }
  }

  sim.on("tick", () => {
    clampToPanel();
    onTick?.();
  });

  function reheat(alpha = GENTLE_ALPHA): void {
    if (nodes.length === 0) return;
    sim.alpha(alpha).restart();
  }

  function setGraph(nextNodes: NetworkNode[], nextEdges: NetworkEdge[]): void {
    const maxValue = nextNodes.reduce((max, node) => Math.max(max, node.value), 0);
    const kept: LayoutNode[] = [];
    const seen = new Set<string>();

    for (const next of nextNodes) {
      seen.add(next.id);
      const existing = byId.get(next.id);
      if (existing) {
        patchNode(existing, next, maxValue);
        kept.push(existing);
        continue;
      }
      const created: LayoutNode = { ...next, radius: nodeRadius(next.value, maxValue) };
      byId.set(next.id, created);
      kept.push(created);
    }
    for (const id of [...byId.keys()]) {
      if (!seen.has(id)) byId.delete(id);
    }

    const nodesChanged = kept.length !== nodes.length || kept.some((node, index) => nodes[index] !== node);
    nodes = kept;

    // An edge whose endpoint left the record cannot be drawn, and d3 would throw looking it up.
    const usable = nextEdges.filter((edge) => byId.has(edge.source) && byId.has(edge.target));
    const signature = usable.map(edgeKey).join(",");
    const edgesChanged = signature !== edgeSignature;
    if (edgesChanged) {
      edgeSignature = signature;
      edges = usable.map((edge) => ({ source: edge.source, target: edge.target, attribute: edge.attribute }));
    }

    if (nodesChanged || edgesChanged) {
      sim.nodes(nodes);
      // Re-resolve after the node list: forceLink needs the nodes before it can look ids up.
      linkForce.links(edges);
    }

    if (!seeded) {
      seeded = true;
      reheat(FIRST_ALPHA);
      return;
    }
    reheat(nodesChanged || edgesChanged ? STRUCTURE_ALPHA : GENTLE_ALPHA);
  }

  return {
    nodes: () => nodes,
    edges: () => edges,
    setGraph,
    tick: (cb) => {
      onTick = cb;
    },
    resize: (nextWidth, nextHeight) => {
      panelWidth = Math.max(1, nextWidth);
      panelHeight = Math.max(1, nextHeight);
      centreX.x(panelWidth / 2);
      centreY.y(panelHeight / 2);
      clampToPanel();
      reheat();
    },
    reheat,
    stop: () => {
      sim.stop();
      sim.on("tick", null);
      onTick = null;
    },
  };
}
