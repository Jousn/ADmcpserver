import * as z from "zod/v4";
import {
  type AuditPin,
  type AuditWire,
  type AuditPort,
  type AuditLabel,
  type AuditJunction,
  type AuditPinNet,
  buildGeometricClusters,
} from "./checkConnectivity.js";

/**
 * analyze_schematic_quality: PREDICTIVE drawing-quality analysis of a schematic.
 *
 * Answers "if I place/rotate components like THIS, will the wiring look good?"
 * WITHOUT touching the Altium document. Pure geometry on already-fetched data:
 *
 * 1. CURRENT LAYOUT (actual wires):
 *    - crossings between different nets, total bends, total wire length,
 *      wire-through-component-body hits, per-net detour ratio (actual / MST).
 *
 * 2. HYPOTHETICAL LAYOUT (transforms param): pin positions are re-simulated in
 *    memory (rotate about component origin + translate) and the routing is
 *    ESTIMATED with the same model used for the current layout, so the
 *    before/after comparison is apples-to-apples.
 *
 * 3. ROTATION SUGGESTIONS: for every component each 0/90/180/270 rotation is
 *    tried in the simulator; rotations that improve the estimated score are
 *    reported (the classic case: a 2-pin polarized cap whose + pin faces away
 *    from the rail, forcing 3-bend detours — rotating 180° makes it a direct
 *    L).
 *
 * Electrical correctness is NOT judged here — that is check_connectivity's job.
 * This tool only predicts VISUAL/routing quality under the assumption the
 * netlist (pin-to-net assignment) stays fixed.
 */

export const analyzeSchematicQualityInputSchema = z.object({
  schematic_full_path: z
    .string()
    .optional()
    .describe("Absolute path to one .SchDoc (same scoping as get_schematic_data)."),
  project_full_path: z.string().optional().describe("Absolute path to an open .PrjPcb."),
  schematic_sheet_file_name: z.string().optional().describe("Sheet file name, e.g. Sheet1.SchDoc."),
  transforms: z
    .array(
      z.object({
        designator: z.string().describe("Component reference designator, e.g. C3."),
        x_mils: z.number().optional().describe("Hypothetical absolute X of component origin."),
        y_mils: z.number().optional().describe("Hypothetical absolute Y of component origin."),
        rotation_deg: z
          .number()
          .optional()
          .describe("Hypothetical absolute rotation 0/90/180/270."),
      }),
    )
    .optional()
    .describe(
      "Hypothetical component transforms to simulate BEFORE drawing. Leave empty to analyze the current layout only.",
    ),
  suggest_rotations: z
    .boolean()
    .optional()
    .describe("Try all 4 rotations per component in the simulator and report improvements (default true)."),
});

export type AnalyzeSchematicQualityInput = z.infer<typeof analyzeSchematicQualityInputSchema>;

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

export interface QualityComponent {
  designator: string;
  /** Component origin (Location) in mils. */
  x: number;
  y: number;
  /** Current bounding box size in mils (axis-aligned, at current rotation). */
  width: number;
  height: number;
  rotation: number;
}

export interface ComponentTransform {
  designator: string;
  x_mils?: number;
  y_mils?: number;
  rotation_deg?: number;
}

export interface QualityInput {
  components: QualityComponent[];
  pins: AuditPin[];
  wires: AuditWire[];
  ports: AuditPort[];
  labels: AuditLabel[];
  junctions: AuditJunction[];
  /** Compiled per-pin net rows; empty = geometry-fallback net grouping. */
  pinNets: AuditPinNet[];
}

export interface LayoutEstimate {
  /** Estimated total routed wire length (mils). */
  est_length_mils: number;
  /** Estimated total bends across all L-routed net edges. */
  est_bends: number;
  /** Estimated crossings between different nets. */
  est_crossings: number;
  /** Estimated segments passing through component bounding boxes. */
  est_obstacle_hits: number;
  /** Fraction of net edges that need ZERO bends (aligned endpoints). */
  direct_connect_rate: number;
  /** Weighted score — lower is better. */
  score: number;
}

export interface CrossingDetail {
  net_a: string;
  net_b: string;
  x: number;
  y: number;
}

export interface ActualWireMetrics {
  total_length_mils: number;
  total_bends: number;
  crossings: number;
  obstacle_hits: number;
  score: number;
  crossing_details: CrossingDetail[];
  worst_detour_nets: Array<{
    net: string;
    actual_length_mils: number;
    mst_length_mils: number;
    detour_ratio: number;
  }>;
}

export interface RotationSuggestion {
  designator: string;
  current_rotation: number;
  suggested_rotation: number;
  current_est_score: number;
  after_est_score: number;
  improvement: number;
}

export interface QualityReport {
  data_source: "compiled-dm" | "geometry-fallback";
  sheet_summary: {
    components: number;
    pins_visible: number;
    wires: number;
    nets: number;
  };
  /** Real wires as drawn now. */
  current: {
    actual_wires: ActualWireMetrics;
    /** Estimator on the CURRENT pin layout (same model as hypothetical — compare these). */
    estimated: LayoutEstimate;
  };
  /** Estimator on the hypothetical pin layout, if transforms given. */
  hypothetical?: {
    transforms: ComponentTransform[];
    estimated: LayoutEstimate;
    delta: {
      crossings: number;
      bends: number;
      length_mils: number;
      obstacle_hits: number;
      score: number;
    };
  };
  rotation_suggestions: RotationSuggestion[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const EPS = 1.0;

interface Pt {
  x: number;
  y: number;
}

/** Rotate vector (dx,dy) by deg CCW in Altium's Y-up schematic coordinates. */
function rotateVec(dx: number, dy: number, deg: number): Pt {
  const d = ((deg % 360) + 360) % 360;
  if (d === 0) return { x: dx, y: dy };
  if (d === 90) return { x: -dy, y: dx };
  if (d === 180) return { x: -dx, y: -dy };
  if (d === 270) return { x: dy, y: -dx };
  const r = (d * Math.PI) / 180;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function segLen(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Proper intersection point of two segments (any touching), or null. */
function segIntersect(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): Pt | null {
  const d1 = (b.x2 - b.x1) * (a.y1 - b.y1) - (b.y2 - b.y1) * (a.x1 - b.x1);
  const d2 = (b.x2 - b.x1) * (a.y2 - b.y1) - (b.y2 - b.y1) * (a.x2 - b.x1);
  const d3 = (a.x2 - a.x1) * (b.y1 - a.y1) - (a.y2 - a.y1) * (b.x1 - a.x1);
  const d4 = (a.x2 - a.x1) * (b.y2 - a.y1) - (a.y2 - a.y1) * (b.x2 - a.x1);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    // Proper crossing — solve for the point.
    const t = d3 / (d3 - d4);
    return { x: a.x1 + t * (a.x2 - a.x1), y: a.y1 + t * (a.y2 - a.y1) };
  }
  if (d1 === 0 && pointOnSeg2(a.x1, a.y1, b)) return { x: a.x1, y: a.y1 };
  if (d2 === 0 && pointOnSeg2(a.x2, a.y2, b)) return { x: a.x2, y: a.y2 };
  if (d3 === 0 && pointOnSeg2(b.x1, b.y1, a)) return { x: b.x1, y: b.y1 };
  if (d4 === 0 && pointOnSeg2(b.x2, b.y2, a)) return { x: b.x2, y: b.y2 };
  return null;
}

function pointOnSeg2(px: number, py: number, s: { x1: number; y1: number; x2: number; y2: number }): boolean {
  const minX = Math.min(s.x1, s.x2) - EPS;
  const maxX = Math.max(s.x1, s.x2) + EPS;
  const minY = Math.min(s.y1, s.y2) - EPS;
  const maxY = Math.max(s.y1, s.y2) + EPS;
  return px >= minX && px <= maxX && py >= minY && py <= maxY &&
    Math.abs((s.x2 - s.x1) * (py - s.y1) - (s.y2 - s.y1) * (px - s.x1)) < EPS *
      Math.max(1, Math.hypot(s.x2 - s.x1, s.y2 - s.y1));
}

function ptEq(ax: number, ay: number, bx: number, by: number, eps = EPS): boolean {
  return Math.abs(ax - bx) <= eps && Math.abs(ay - by) <= eps;
}

/** True if the point is strictly inside (not on an edge of) the rect. */
function pointInRectStrict(px: number, py: number, r: Rect): boolean {
  return px > r.left + EPS && px < r.right - EPS && py > r.bottom + EPS && py < r.top - EPS;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Segment overlaps the rect interior (Liang-Barsky style, inclusive edges excluded by EPS shrink). */
function segHitsRect(
  s: { x1: number; y1: number; x2: number; y2: number },
  r: Rect,
): boolean {
  // Quick reject.
  if (Math.max(s.x1, s.x2) < r.left || Math.min(s.x1, s.x2) > r.right) return false;
  if (Math.max(s.y1, s.y2) < r.bottom || Math.min(s.y1, s.y2) > r.top) return false;
  // Either endpoint strictly inside -> hit.
  if (pointInRectStrict(s.x1, s.y1, r) || pointInRectStrict(s.x2, s.y2, r)) return true;
  // Crossing any of the 4 edges counts.
  const edges = [
    { x1: r.left, y1: r.bottom, x2: r.right, y2: r.bottom },
    { x1: r.left, y1: r.top, x2: r.right, y2: r.top },
    { x1: r.left, y1: r.bottom, x2: r.left, y2: r.top },
    { x1: r.right, y1: r.bottom, x2: r.right, y2: r.top },
  ];
  return edges.some((e) => segIntersect(s, e) !== null);
}

// ---------------------------------------------------------------------------
// Net grouping (DM layer preferred, geometric fallback)
// ---------------------------------------------------------------------------

interface NetNode extends Pt {
  owner: string; // component designator, or "" for ports
}

interface NetGroup {
  name: string;
  nodes: NetNode[];
}

function pinId(p: AuditPin): string {
  return `${p.designator}.${p.pinDesignator || p.pinName}`;
}

function buildNetGroups(
  pins: AuditPin[],
  ports: AuditPort[],
  labels: AuditLabel[],
  pinNets: AuditPinNet[],
  wires: AuditWire[],
  junctions: AuditJunction[],
): { groups: Map<string, NetGroup>; wireNet: Map<number, string | null>; data_source: "compiled-dm" | "geometry-fallback" } {
  const groups = new Map<string, NetGroup>();
  const visiblePins = pins.filter((p) => !p.isHidden);

  if (pinNets.length > 0) {
    for (const row of pinNets) {
      if (row.unconnected) continue;
      const name = row.net || "(unnamed)";
      const pin = visiblePins.find((p) => p.designator === row.designator && (p.pinDesignator || p.pinName) === row.pin);
      if (!pin) continue;
      const g = groups.get(name) ?? { name, nodes: [] };
      g.nodes.push({ x: pin.x, y: pin.y, owner: pin.designator });
      groups.set(name, g);
    }
    // Power ports join their net as fixed nodes.
    for (const port of ports) {
      const name = port.net || "(unnamed)";
      const g = groups.get(name) ?? { name, nodes: [] };
      g.nodes.push({ x: port.x, y: port.y, owner: "" });
      groups.set(name, g);
    }
    // Wire -> net via geometric cluster membership (pins/ports touching it).
    const geo = buildGeometricClusters({ pins, wires, ports, labels, junctions });
    const wireNet = new Map<number, string | null>();
    for (const w of wires) {
      let net: string | null = null;
      for (const p of visiblePins) {
        if (!geo.ds.same(geo.wireKey(w), geo.pinKey(p))) continue;
        const row = pinNets.find(
          (r) => r.designator === p.designator && r.pin === (p.pinDesignator || p.pinName),
        );
        if (row && !row.unconnected) {
          net = row.net;
          break;
        }
      }
      if (net === null) {
        for (let i = 0; i < ports.length; i++) {
          if (geo.ds.same(geo.wireKey(w), geo.portKey(i))) {
            net = ports[i].net;
            break;
          }
        }
      }
      wireNet.set(w.index, net);
    }
    return { groups, wireNet, data_source: "compiled-dm" };
  }

  // Geometry fallback: cluster pins/ports/labels; net name from port/label members.
  const geo = buildGeometricClusters({ pins, wires, ports, labels, junctions });
  const rootToName = new Map<string, string>();
  for (let i = 0; i < ports.length; i++) rootToName.set(geo.ds.find(geo.portKey(i)), ports[i].net);
  for (let i = 0; i < labels.length; i++) {
    const root = geo.ds.find(geo.labelKey(i));
    if (!rootToName.has(root)) rootToName.set(root, labels[i].net);
  }
  for (const p of visiblePins) {
    const root = geo.ds.find(geo.pinKey(p));
    const name = rootToName.get(root) ?? "(unnamed)";
    const g = groups.get(name) ?? { name, nodes: [] };
    g.nodes.push({ x: p.x, y: p.y, owner: p.designator });
    groups.set(name, g);
  }
  for (const port of ports) {
    const name = port.net || "(unnamed)";
    const g = groups.get(name) ?? { name, nodes: [] };
    g.nodes.push({ x: port.x, y: port.y, owner: "" });
    groups.set(name, g);
  }
  const wireNet = new Map<number, string | null>();
  for (const w of wires) wireNet.set(w.index, rootToName.get(geo.ds.find(geo.wireKey(w))) ?? null);
  return { groups, wireNet, data_source: "geometry-fallback" };
}

// ---------------------------------------------------------------------------
// Estimated routing (MST + L-shaped edges) — the layout simulator
// ---------------------------------------------------------------------------

interface EstSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  net: string;
  owners: Set<string>;
}

function manhattan(a: Pt, b: Pt): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Prim's MST over nodes with Manhattan distance. */
function mst(nodes: NetNode[]): Array<{ a: NetNode; b: NetNode }> {
  const edges: Array<{ a: NetNode; b: NetNode }> = [];
  if (nodes.length < 2) return edges;
  const inTree = [0];
  const rest = nodes.map((_, i) => i).slice(1);
  while (rest.length > 0) {
    let bestA = -1;
    let bestB = -1;
    let bestD = Infinity;
    for (const ai of inTree) {
      for (const bi of rest) {
        const d = manhattan(nodes[ai], nodes[bi]);
        if (d < bestD) {
          bestD = d;
          bestA = ai;
          bestB = bi;
        }
      }
    }
    edges.push({ a: nodes[bestA], b: nodes[bestB] });
    inTree.push(bestB);
    rest.splice(rest.indexOf(bestB), 1);
  }
  return edges;
}

/** Route one edge as an L (1 bend); choose the variant with fewer obstacle hits. */
function routeEdgeL(a: NetNode, b: NetNode, rects: Array<{ rect: Rect; owner: string }>): EstSegment[] {
  const aligned = Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS;
  if (aligned) {
    return [
      { x1: a.x, y1: a.y, x2: b.x, y2: b.y, net: "", owners: new Set([a.owner, b.owner]) },
    ];
  }
  const variants: Array<Array<{ x1: number; y1: number; x2: number; y2: number }>> = [
    // HV: horizontal first, then vertical.
    [
      { x1: a.x, y1: a.y, x2: b.x, y2: a.y },
      { x1: b.x, y1: a.y, x2: b.x, y2: b.y },
    ],
    // VH: vertical first, then horizontal.
    [
      { x1: a.x, y1: a.y, x2: a.x, y2: b.y },
      { x1: a.x, y1: b.y, x2: b.x, y2: b.y },
    ],
  ];
  const owners = new Set([a.owner, b.owner]);
  let best = variants[0];
  let bestHits = Infinity;
  for (const v of variants) {
    let hits = 0;
    for (const r of rects) {
      if (r.owner && owners.has(r.owner)) continue;
      if (v.some((s) => segHitsRect(s, r.rect))) hits++;
    }
    if (hits < bestHits) {
      bestHits = hits;
      best = v;
    }
  }
  return best.map((s) => ({ ...s, net: "", owners: new Set(owners) }));
}

function estimateLayout(
  groups: Map<string, NetGroup>,
  rects: Array<{ rect: Rect; owner: string }>,
): LayoutEstimate {
  const segments: EstSegment[] = [];
  let estLength = 0;
  let estBends = 0;
  let edgeCount = 0;
  let zeroBendEdges = 0;

  for (const g of groups.values()) {
    if (g.nodes.length < 2) continue;
    const edges = mst(g.nodes);
    for (const e of edges) {
      const segs = routeEdgeL(e.a, e.b, rects);
      for (const s of segs) {
        s.net = g.name;
        segments.push(s);
        estLength += segLen(s.x1, s.y1, s.x2, s.y2);
      }
      edgeCount++;
      const bends = segs.length - 1;
      estBends += bends;
      if (bends === 0) zeroBendEdges++;
    }
  }

  // Crossings between different-net segments.
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i].net === segments[j].net) continue;
      if (segIntersect(segments[i], segments[j])) crossings++;
    }
  }

  // Obstacle hits: segment through a component bbox it does not own.
  let obstacleHits = 0;
  for (const s of segments) {
    for (const r of rects) {
      if (r.owner && s.owners.has(r.owner)) continue;
      if (segHitsRect(s, r.rect)) obstacleHits++;
    }
  }

  const score = 10 * crossings + estBends + 3 * obstacleHits + estLength / 100;
  return {
    est_length_mils: round(estLength),
    est_bends: estBends,
    est_crossings: crossings,
    est_obstacle_hits: obstacleHits,
    direct_connect_rate: edgeCount > 0 ? round(zeroBendEdges / edgeCount) : 1,
    score: round(score),
  };
}

// ---------------------------------------------------------------------------
// Actual wire metrics (current layout, real wires)
// ---------------------------------------------------------------------------

function actualWireMetrics(
  wires: AuditWire[],
  wireNet: Map<number, string | null>,
  pins: AuditPin[],
  components: QualityComponent[],
  groups: Map<string, NetGroup>,
): ActualWireMetrics {
  interface WSeg {
    wireIndex: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  const segs: WSeg[] = [];
  let totalLength = 0;
  let totalBends = 0;

  for (const w of wires) {
    for (let i = 0; i + 1 < w.vertices.length; i++) {
      segs.push({
        wireIndex: w.index,
        x1: w.vertices[i].x,
        y1: w.vertices[i].y,
        x2: w.vertices[i + 1].x,
        y2: w.vertices[i + 1].y,
      });
      totalLength += segLen(
        w.vertices[i].x,
        w.vertices[i].y,
        w.vertices[i + 1].x,
        w.vertices[i + 1].y,
      );
    }
    // Bends: non-collinear interior vertices.
    for (let i = 1; i + 1 < w.vertices.length; i++) {
      const p = w.vertices[i - 1];
      const c = w.vertices[i];
      const n = w.vertices[i + 1];
      const cross = (c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x);
      if (Math.abs(cross) > EPS) totalBends++;
    }
  }

  // Crossings between segments of different wires AND different nets.
  const crossings: CrossingDetail[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].wireIndex === segs[j].wireIndex) continue;
      const na = wireNet.get(segs[i].wireIndex) ?? null;
      const nb = wireNet.get(segs[j].wireIndex) ?? null;
      if (na !== null && nb !== null && na === nb) continue; // same net: junction/tap, not a visual defect
      const pt = segIntersect(segs[i], segs[j]);
      if (pt) crossings.push({ net_a: na ?? "?", net_b: nb ?? "?", x: round(pt.x), y: round(pt.y) });
    }
  }

  // Obstacle hits: wire segment through a component bbox (excluding components
  // whose pins touch that wire — their bodies legitimately meet the wire ends).
  let obstacleHits = 0;
  const visiblePins = pins.filter((p) => !p.isHidden);
  for (const s of segs) {
    const w = wires.find((x) => x.index === s.wireIndex);
    if (!w) continue;
    const touchers = new Set<string>();
    for (const v of w.vertices) {
      for (const p of visiblePins) {
        if (ptEq(v.x, v.y, p.x, p.y)) touchers.add(p.designator);
      }
    }
    for (const c of components) {
      if (touchers.has(c.designator)) continue;
      const rect: Rect = {
        left: c.x - c.width / 2,
        right: c.x + c.width / 2,
        top: c.y + c.height / 2,
        bottom: c.y - c.height / 2,
      };
      if (segHitsRect(s, rect)) obstacleHits++;
    }
  }

  // Per-net detour ratio (actual wire length of the net / MST of its nodes).
  const netWireLen = new Map<string, number>();
  for (const s of segs) {
    const n = wireNet.get(s.wireIndex) ?? null;
    if (n === null) continue;
    netWireLen.set(n, (netWireLen.get(n) ?? 0) + segLen(s.x1, s.y1, s.x2, s.y2));
  }
  const detours: ActualWireMetrics["worst_detour_nets"] = [];
  for (const g of groups.values()) {
    if (g.nodes.length < 2) continue;
    const mstLen = mst(g.nodes).reduce((acc, e) => acc + manhattan(e.a, e.b), 0);
    const actual = netWireLen.get(g.name) ?? 0;
    if (mstLen > 0 && actual > 0) {
      detours.push({
        net: g.name,
        actual_length_mils: round(actual),
        mst_length_mils: round(mstLen),
        detour_ratio: round(actual / mstLen),
      });
    }
  }
  detours.sort((a, b) => b.detour_ratio - a.detour_ratio);

  const score = 10 * crossings.length + totalBends + 3 * obstacleHits + totalLength / 100;
  return {
    total_length_mils: round(totalLength),
    total_bends: totalBends,
    crossings: crossings.length,
    obstacle_hits: obstacleHits,
    score: round(score),
    crossing_details: crossings.slice(0, 20),
    worst_detour_nets: detours.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Transform simulation
// ---------------------------------------------------------------------------

interface Simulated {
  components: QualityComponent[];
  pins: AuditPin[];
}

function applyTransforms(input: QualityInput, transforms: ComponentTransform[]): Simulated {
  const tByDes = new Map(transforms.map((t) => [t.designator, t]));
  const components: QualityComponent[] = input.components.map((c) => {
    const t = tByDes.get(c.designator);
    if (!t) return { ...c };
    const nx = t.x_mils ?? c.x;
    const ny = t.y_mils ?? c.y;
    const nrot = t.rotation_deg ?? c.rotation;
    const delta = nrot - c.rotation;
    // Rotate the bbox center offset about the origin; odd rotations swap w/h.
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const off = rotateVec(cx - c.x, cy - c.y, delta);
    const odd = ((Math.round(delta) % 180) + 360) % 360 === 90;
    const w = odd ? c.height : c.width;
    const h = odd ? c.width : c.height;
    return {
      designator: c.designator,
      x: nx,
      y: ny,
      width: w,
      height: h,
      rotation: ((Math.round(nrot) % 360) + 360) % 360,
    };
  });

  const pins: AuditPin[] = input.pins.map((p) => {
    const t = tByDes.get(p.designator);
    const comp = input.components.find((c) => c.designator === p.designator);
    if (!t || !comp) return { ...p };
    const nx = t.x_mils ?? comp.x;
    const ny = t.y_mils ?? comp.y;
    const delta = (t.rotation_deg ?? comp.rotation) - comp.rotation;
    const off = rotateVec(p.x - comp.x, p.y - comp.y, delta);
    return { ...p, x: round(nx + off.x), y: round(ny + off.y) };
  });

  return { components, pins };
}

function componentRects(components: QualityComponent[]): Array<{ rect: Rect; owner: string }> {
  return components.map((c) => ({
    owner: c.designator,
    rect: {
      left: c.x - c.width / 2,
      right: c.x + c.width / 2,
      top: c.y + c.height / 2,
      bottom: c.y - c.height / 2,
    },
  }));
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function analyzeSchematicQuality(
  input: QualityInput,
  options: { transforms?: ComponentTransform[]; suggestRotations?: boolean } = {},
): QualityReport {
  const transforms = options.transforms ?? [];
  const suggestRotations = options.suggestRotations ?? true;
  const notes: string[] = [];

  // Nets from CURRENT geometry (net membership never changes with transforms —
  // that is the invariant that guarantees functional correctness).
  const { groups, wireNet, data_source } = buildNetGroups(
    input.pins,
    input.ports,
    input.labels,
    input.pinNets,
    input.wires,
    input.junctions,
  );

  // Current layout: actual wires + estimator baseline.
  const actual = actualWireMetrics(input.wires, wireNet, input.pins, input.components, groups);
  const currentEst = estimateLayout(groups, componentRects(input.components));

  const report: QualityReport = {
    data_source,
    sheet_summary: {
      components: input.components.length,
      pins_visible: input.pins.filter((p) => !p.isHidden).length,
      wires: input.wires.length,
      nets: groups.size,
    },
    current: { actual_wires: actual, estimated: currentEst },
    rotation_suggestions: [],
    notes,
  };

  // Hypothetical layout.
  if (transforms.length > 0) {
    const sim = applyTransforms(input, transforms);
    const simGroups = buildNetGroups(
      sim.pins,
      input.ports,
      input.labels,
      input.pinNets,
      input.wires,
      input.junctions,
    ).groups;
    const hypEst = estimateLayout(simGroups, componentRects(sim.components));
    report.hypothetical = {
      transforms,
      estimated: hypEst,
      delta: {
        crossings: hypEst.est_crossings - currentEst.est_crossings,
        bends: hypEst.est_bends - currentEst.est_bends,
        length_mils: round(hypEst.est_length_mils - currentEst.est_length_mils),
        obstacle_hits: hypEst.est_obstacle_hits - currentEst.est_obstacle_hits,
        score: round(hypEst.score - currentEst.score),
      },
    };
    notes.push(
      "Hypothetical estimate: pin coordinates re-simulated by rotating pin offsets about the component origin (CCW, Y-up) and translating. Compare hypothetical.estimated against current.estimated — same model, apples-to-apples. Score DELTA is negative = improvement.",
    );
  }

  // Rotation suggestions: try each rotation for every component.
  if (suggestRotations) {
    const suggestions: RotationSuggestion[] = [];
    for (const c of input.components) {
      const pinCount = input.pins.filter((p) => p.designator === c.designator && !p.isHidden).length;
      if (pinCount === 0) continue;
      let best: RotationSuggestion | null = null;
      for (const r of [0, 90, 180, 270] as const) {
        if (r === ((Math.round(c.rotation) % 360) + 360) % 360) continue;
        const sim = applyTransforms(input, [{ designator: c.designator, rotation_deg: r }]);
        const simGroups = buildNetGroups(
          sim.pins,
          input.ports,
          input.labels,
          input.pinNets,
          input.wires,
          input.junctions,
        ).groups;
        const est = estimateLayout(simGroups, componentRects(sim.components));
        const improvement = round(currentEst.score - est.score);
        if (improvement > 0.5 && (!best || improvement > best.improvement)) {
          best = {
            designator: c.designator,
            current_rotation: c.rotation,
            suggested_rotation: r,
            current_est_score: currentEst.score,
            after_est_score: est.score,
            improvement,
          };
        }
      }
      if (best) suggestions.push(best);
    }
    suggestions.sort((a, b) => b.improvement - a.improvement);
    report.rotation_suggestions = suggestions.slice(0, 10);
    notes.push(
      "Rotation suggestions are SIMULATED only — nothing was modified. To apply: edit_schematic set_component_transform (rotation_deg), then re-read pin coordinates with get_component_info before redrawing any wire. Verify with check_connectivity afterwards.",
    );
  }

  notes.push(
    "Estimator model: per net a Manhattan MST is built and each edge routed as an L (1 bend, obstacle-avoiding variant preferred). Score = 10*crossings + bends + 3*obstacle_hits + length/100. Lower is better.",
  );
  if (data_source === "geometry-fallback") {
    notes.push(
      "Compiled net data was unavailable — nets were inferred geometrically (less authoritative). Run compile_project and retry for reliable net grouping.",
    );
  }

  return report;
}
