import {
  type AuditPin,
  type AuditPinNet,
  type AuditPort,
  type AuditWire,
  buildGeometricClusters,
} from "./checkConnectivity.js";

/**
 * Net-aware orthogonal schematic router (shared by wire_pins and optimize_layout).
 *
 * Ported from the verified test scripts trash/test/fixAndApply.mjs and
 * trash/test/optimizePlacement.mjs (2026-09-04 run: 73 wires re-anchored, 18
 * re-routed; netlist partition identical before/after, errors=0).
 *
 * Semantics preserved exactly:
 * - Dijkstra over (node, arrival-direction) states on a uniform grid, turn
 *   penalty 80, obstacle margin 700 mil around the routing bbox.
 * - Foreign-net pin hotspots are blocked nodes; grid edges passing within
 *   25 mil of a foreign pin are blocked.
 * - Existing/planned polylines are obstacles per segRel: 'overlap' with a
 *   foreign net blocks, 'touch' blocks unless the touch point is an allowed
 *   contact (an endpoint we deliberately land on), 'cross' (X crossing) is
 *   always safe, same-net contact is always harmless.
 *
 * Addition vs the scripts: chooseGrid() picks the largest grid from
 * [100, 50, 20, 10] mils on which every endpoint lies, so pins that are not
 * on the 100-mil grid still route instead of throwing off-grid.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Polyline {
  pts: Array<[number, number]>;
  net: string;
}

export const keyOf = (x: number, y: number): string => `${Math.round(x)},${Math.round(y)}`;

// ---------------------------------------------------------------------------
// Segment geometry
// ---------------------------------------------------------------------------

export function distPtSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export type Seg = [Pt, Pt];

/** Classify segment-segment relationship: 'none' | 'cross' | 'touch' | 'overlap'. */
export function segRel(s1: Seg, s2: Seg): "none" | "cross" | "touch" | "overlap" {
  const x1 = s1[0].x, y1 = s1[0].y, x2 = s1[1].x, y2 = s1[1].y;
  const x3 = s2[0].x, y3 = s2[0].y, x4 = s2[1].x, y4 = s2[1].y;
  const eps = 1e-6;
  const onSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) =>
    px >= Math.min(ax, bx) - eps && px <= Math.max(ax, bx) + eps &&
    py >= Math.min(ay, by) - eps && py <= Math.max(ay, by) + eps &&
    Math.abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) < eps;
  const d1 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
  const d2 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
  const d3 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d4 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);
  const collinear = Math.abs(d1) < eps && Math.abs(d2) < eps && Math.abs(d3) < eps && Math.abs(d4) < eps;
  if (collinear) {
    const ovl =
      Math.min(Math.max(x1, x2), Math.max(x3, x4)) -
      Math.max(Math.min(x1, x2), Math.min(x3, x4));
    const ovlY =
      Math.min(Math.max(y1, y2), Math.max(y3, y4)) -
      Math.max(Math.min(y1, y2), Math.min(y3, y4));
    if (ovl > 1 || ovlY > 1) return "overlap";
    if (ovl >= 0 && ovlY >= 0) return "touch"; // collinear, meet at exactly one point
    return "none"; // collinear but disjoint
  }
  const intersects =
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  if (intersects) {
    // proper X crossing?
    const t = d3 / (d3 - d4);
    const px = x1 + t * (x2 - x1);
    const py = y1 + t * (y2 - y1);
    const interiorS1 = (px > Math.min(x1, x2) + 1 && px < Math.max(x1, x2) - 1) ||
      (py > Math.min(y1, y2) + 1 && py < Math.max(y1, y2) - 1);
    const interiorS2 = (px > Math.min(x3, x4) + 1 && px < Math.max(x3, x4) - 1) ||
      (py > Math.min(y3, y4) + 1 && py < Math.max(y3, y4) - 1);
    return interiorS1 && interiorS2 ? "cross" : "touch";
  }
  // endpoint-on-segment contact (T or L)
  if (onSeg(x1, y1, x3, y3, x4, y4) || onSeg(x2, y2, x3, y3, x4, y4) ||
    onSeg(x3, y3, x1, y1, x2, y2) || onSeg(x4, y4, x1, y1, x2, y2)) return "touch";
  return "none";
}

export function touchPoint(s1: Seg, s2: Seg): [number, number] {
  const x1 = s1[0].x, y1 = s1[0].y, x2 = s1[1].x, y2 = s1[1].y;
  const x3 = s2[0].x, y3 = s2[0].y, x4 = s2[1].x, y4 = s2[1].y;
  const eps = 1e-6;
  const onSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) =>
    px >= Math.min(ax, bx) - eps && px <= Math.max(ax, bx) + eps &&
    py >= Math.min(ay, by) - eps && py <= Math.max(ay, by) + eps &&
    Math.abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) < eps;
  if (onSeg(x1, y1, x3, y3, x4, y4)) return [x1, y1];
  if (onSeg(x2, y2, x3, y3, x4, y4)) return [x2, y2];
  if (onSeg(x3, y3, x1, y1, x2, y2)) return [x3, y3];
  if (onSeg(x4, y4, x1, y1, x2, y2)) return [x4, y4];
  return [NaN, NaN];
}

// ---------------------------------------------------------------------------
// Net bookkeeping
// ---------------------------------------------------------------------------

export const pinIdOf = (p: AuditPin): string => `${p.designator}.${p.pinDesignator || p.pinName}`;

/** Map of "DES.PIN" -> compiled net name (floating/unconnected pins omitted). */
export function pinNetMapOf(pinNets: AuditPinNet[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of pinNets ?? []) {
    if (r.unconnected || !r.designator || !r.pin) continue;
    m.set(`${r.designator}.${r.pin}`, String(r.net));
  }
  return m;
}

/**
 * Net of every existing wire: union-find pins/ports/wires by contact
 * (buildGeometricClusters), then read the net from any pin/port member.
 * Mirrors computeWireNets() from fixAndApply.mjs.
 */
export function computeWireNets(
  pins: AuditPin[],
  wires: AuditWire[],
  ports: AuditPort[],
  pinNets: AuditPinNet[],
): Map<number, string | null> {
  const geo = buildGeometricClusters({ pins, wires, ports, labels: [], junctions: [] });
  const pinNetOf = pinNetMapOf(pinNets);
  const rootNet = new Map<string, string | null>();
  const labelNet = (root: string): string | null => {
    if (rootNet.has(root)) return rootNet.get(root) ?? null;
    let net: string | null = null;
    for (const p of pins) {
      if (geo.ds.same(geo.pinKey(p), root)) {
        net = pinNetOf.get(`${p.designator}.${p.pinDesignator || p.pinName}`) ?? net;
        if (net) break;
      }
    }
    if (net === null) {
      for (let i = 0; i < ports.length; i++) {
        if (geo.ds.same(geo.portKey(i), root)) {
          net = ports[i].net;
          break;
        }
      }
    }
    rootNet.set(root, net);
    return net;
  };
  const netByIndex = new Map<number, string | null>();
  wires.forEach((w, i) => netByIndex.set(i, labelNet(geo.ds.find(geo.wireKey({ index: i, vertices: [] })))));
  return netByIndex;
}

/**
 * Netlist partition (set of sorted pin-lists, one per net) — the electrical
 * equivalence signature used to verify that a rewire changed nothing.
 */
export function partitionOf(pinNets: AuditPinNet[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const r of pinNets ?? []) {
    if (r.unconnected || !r.designator || !r.pin) continue;
    const k = `${r.designator}.${r.pin}`;
    const list = groups.get(String(r.net)) ?? [];
    list.push(k);
    groups.set(String(r.net), list);
  }
  return new Set([...groups.values()].map((l) => l.sort().join(" | ")));
}

// ---------------------------------------------------------------------------
// Grid selection
// ---------------------------------------------------------------------------

const GRID_CANDIDATES = [100, 50, 20, 10];

/**
 * Largest candidate grid on which every point lies (within 1e-6). Throws when
 * a point is off even the 10-mil grid — that would mean a malformed pin
 * coordinate, better to fail loudly than to draw off-grid wires.
 */
export function chooseGrid(points: Array<[number, number]>): number {
  const onGrid = (v: number, g: number) => Math.abs(v / g - Math.round(v / g)) < 1e-6;
  for (const g of GRID_CANDIDATES) {
    if (points.every(([x, y]) => onGrid(x, g) && onGrid(y, g))) return g;
  }
  throw new Error(
    `endpoint off the 10-mil grid: ${points.map((p) => `(${p[0]},${p[1]})`).join(" ")}`,
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface RouteOptions {
  net: string;
  pins: AuditPin[];
  pinNetOf: Map<string, string>;
  /** Pin ids ("DES.PIN") treated as SAME-net regardless of compiled state (pins this call will connect). */
  sameNetPins?: Set<string>;
  /** Existing + already-planned polylines with their nets. */
  obstacles: Polyline[];
  /** Touch points we deliberately land on (the two endpoints). */
  allowedContacts: Set<string>;
  /**
   * Component keep-out rectangles (any corner order) — grid nodes strictly
   * inside (minus a small edge margin) are blocked so routes never cross a
   * symbol body. Pin hotspots sit on the hull boundary and stay reachable.
   */
  bodyRects?: Array<[number, number, number, number]>;
}

/**
 * Rotation-proof symbol keep-out hulls: bounding box of a component's MEASURED
 * pin hotspots united with its origin point. The exported BoundingRectangle is
 * unreliable for rotated symbols (verified AD22: rects that do not even
 * contain the symbol's own pins), so we derive keep-outs from live pin data:
 *  - opposite-side pins (R/C/diodes): pin bbox IS the body span;
 *  - same-side pins (connectors): the origin sits inside the body behind the
 *    pins and completes the hull.
 * Over-blocks by design (keep-out, not exact body) — margin sits in routePair.
 */
export function componentKeepOutRects(
  pins: AuditPin[],
  components: Array<{ designator?: string; x?: number; y?: number }>,
): Array<[number, number, number, number]> {
  const byDes = new Map<string, { xs: number[]; ys: number[] }>();
  for (const p of pins) {
    if (!p.designator) continue;
    let e = byDes.get(p.designator);
    if (!e) { e = { xs: [], ys: [] }; byDes.set(p.designator, e); }
    e.xs.push(p.x);
    e.ys.push(p.y);
  }
  const out: Array<[number, number, number, number]> = [];
  for (const c of components) {
    if (!c.designator || typeof c.x !== "number" || typeof c.y !== "number") continue;
    const e = byDes.get(c.designator);
    if (!e || e.xs.length === 0) continue;
    const xs = [...e.xs, c.x];
    const ys = [...e.ys, c.y];
    out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return out;
}

/**
 * Route from pin hotspot a to b on a uniform grid. Returns the simplified
 * orthogonal polyline (collinear points merged), or [] when a === b.
 * Throws when no safe route exists — callers plan BEFORE mutating the sheet.
 */
export function routePair(a: [number, number], b: [number, number], opts: RouteOptions): Array<[number, number]> {
  const { net, pins, pinNetOf, obstacles, allowedContacts } = opts;
  const sameNetPins = opts.sameNetPins ?? new Set<string>();
  if (keyOf(a[0], a[1]) === keyOf(b[0], b[1])) return [];

  const G = chooseGrid([a, b]);
  const onGrid = (v: number) => Math.abs(v / G - Math.round(v / G)) < 1e-6;

  // grid bounds around everything relevant (700 mil margin — the value that
  // fixed VCC routing failures in optimizePlacement.mjs)
  let minX = a[0], maxX = a[0], minY = a[1], maxY = a[1];
  const acc = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  acc(b[0], b[1]);
  for (const ob of obstacles) for (const p of ob.pts) acc(p[0], p[1]);
  minX = Math.floor((minX - 700) / G) * G;
  maxX = Math.ceil((maxX + 700) / G) * G;
  minY = Math.floor((minY - 700) / G) * G;
  maxY = Math.ceil((maxY + 700) / G) * G;

  const isForeignPin = (p: AuditPin): boolean => {
    const pk = `${p.designator}.${p.pinDesignator || p.pinName}`;
    if (sameNetPins.has(pk)) return false;
    if (pinNetOf.get(pk) === net) return false;
    return true;
  };

  // foreign pin nodes are blocked (own endpoints never)
  const blockedNode = new Set<string>();
  for (const p of pins) {
    if (!onGrid(p.x) || !onGrid(p.y)) continue;
    if (!isForeignPin(p)) continue;
    if (allowedContacts.has(keyOf(p.x, p.y))) continue;
    blockedNode.add(keyOf(p.x, p.y));
  }
  blockedNode.delete(keyOf(a[0], a[1]));
  blockedNode.delete(keyOf(b[0], b[1]));

  // component bodies: block grid nodes strictly inside (10 mil edge margin so
  // wires may hug the envelope; endpoints/allowed contacts stay reachable)
  const bodyRects = (opts.bodyRects ?? []).map((r) => {
    const x1 = Math.min(r[0], r[2]) + 10;
    const x2 = Math.max(r[0], r[2]) - 10;
    const y1 = Math.min(r[1], r[3]) + 10;
    const y2 = Math.max(r[1], r[3]) - 10;
    return { x1, x2, y1, y2 };
  });
  const inBody = (x: number, y: number): boolean =>
    bodyRects.some((r) => x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2);
  // A grid step may also JUMP OVER a thin blocked band (e.g. a 100-mil step
  // across an 80-mil-tall body strip with no interior node) — reject edges
  // whose segment overlaps any body interior (open-interval box overlap; mere
  // boundary contact stays legal so pin-hotspot landings keep working).
  const edgeCrossesBody = (x1: number, y1: number, x2: number, y2: number): boolean => {
    const ex1 = Math.min(x1, x2);
    const ex2 = Math.max(x1, x2);
    const ey1 = Math.min(y1, y2);
    const ey2 = Math.max(y1, y2);
    return bodyRects.some((r) => ex2 > r.x1 && ex1 < r.x2 && ey2 > r.y1 && ey1 < r.y2);
  };

  const obSegs: Array<{ s: Seg; net: string }> = [];
  for (const ob of obstacles) {
    for (let j = 0; j + 1 < ob.pts.length; j++) {
      obSegs.push({ s: [{ x: ob.pts[j][0], y: ob.pts[j][1] }, { x: ob.pts[j + 1][0], y: ob.pts[j + 1][1] }], net: ob.net });
    }
  }

  const edgeCache = new Map<string, boolean>();
  function edgeBlocked(x1: number, y1: number, x2: number, y2: number): boolean {
    const ek = `${x1},${y1}>${x2},${y2}`;
    const cached = edgeCache.get(ek);
    if (cached !== undefined) return cached;
    let blocked = false;
    const E: Seg = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    for (const p of pins) {
      if (!isForeignPin(p)) continue;
      if (allowedContacts.has(keyOf(p.x, p.y))) continue;
      if (distPtSeg(p.x, p.y, x1, y1, x2, y2) < 25) { blocked = true; break; }
    }
    if (!blocked) {
      for (const ob of obSegs) {
        const rel = segRel(E, ob.s);
        if (rel === "none" || rel === "cross") continue;
        if (rel === "overlap") {
          if (ob.net !== net) { blocked = true; break; }
        } else {
          const [tx, ty] = touchPoint(E, ob.s);
          if (!allowedContacts.has(keyOf(tx, ty)) && ob.net !== net) { blocked = true; break; }
        }
      }
    }
    edgeCache.set(ek, blocked);
    return blocked;
  }

  // Dijkstra over (node, arrival-direction) states, turn-penalized
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const TURN = 80;
  const distMap = new Map<string, number>();
  const back = new Map<string, string>();
  const heap: Array<{ ks: string; d: number }> = [];
  const hpush = (ks: string, d: number) => {
    heap.push({ ks, d });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].d <= heap[i].d) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const hpop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length && last !== undefined) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let m = i;
        const L = 2 * i + 1;
        const R = L + 1;
        if (L < heap.length && heap[L].d < heap[m].d) m = L;
        if (R < heap.length && heap[R].d < heap[m].d) m = R;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const goalK = keyOf(b[0], b[1]);
  const startState = `${keyOf(a[0], a[1])}#-1`;
  distMap.set(startState, 0);
  hpush(startState, 0);
  let goalState: string | null = null;
  while (heap.length) {
    const { ks, d: pri } = hpop();
    if ((distMap.get(ks) ?? Infinity) < pri) continue;
    const hashIdx = ks.lastIndexOf("#");
    const nk = ks.slice(0, hashIdx);
    const d = Number(ks.slice(hashIdx + 1));
    if (nk === goalK) { goalState = ks; break; }
    const cx = Number(ks.slice(0, ks.indexOf(",")));
    const cy = Number(nk.slice(nk.indexOf(",") + 1));
    for (let nd = 0; nd < 4; nd++) {
      const nx = cx + DIRS[nd][0] * G;
      const ny = cy + DIRS[nd][1] * G;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (blockedNode.has(keyOf(nx, ny))) continue;
      if (inBody(nx, ny)) continue;
      if (edgeCrossesBody(cx, cy, nx, ny)) continue;
      if (edgeBlocked(cx, cy, nx, ny)) continue;
      const step = G + (d >= 0 && d !== nd ? TURN : 0);
      const nc = pri + step;
      const nks = `${nx},${ny}#${nd}`;
      if (nc < (distMap.get(nks) ?? Infinity)) {
        distMap.set(nks, nc);
        back.set(nks, ks);
        hpush(nks, nc);
      }
    }
  }
  if (!goalState) {
    throw new Error(
      `no safe route (${a[0]},${a[1]})->(${b[0]},${b[1]}) for net ${net}: blocked by foreign-net wires/pins. ` +
        `Reorder net wiring or move a component (optimize_layout / set_component_transform) and retry.`,
    );
  }

  // reconstruct + simplify collinear points
  const nodes: Array<[number, number]> = [];
  for (let cur = goalState; cur; cur = back.get(cur) ?? "") {
    const hashIdx = cur.lastIndexOf("#");
    const nk = cur.slice(0, hashIdx);
    const c = nk.indexOf(",");
    nodes.push([Number(nk.slice(0, c)), Number(nk.slice(c + 1))]);
  }
  nodes.reverse();
  const pts: Array<[number, number]> = [nodes[0]];
  for (let i = 1; i < nodes.length - 1; i++) {
    const p0 = pts[pts.length - 1];
    const p1 = nodes[i];
    const p2 = nodes[i + 1];
    const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
    if (Math.abs(cross) > 1e-6) pts.push(p1);
  }
  pts.push(nodes[nodes.length - 1]);
  return pts;
}

// ---------------------------------------------------------------------------
// Net construction helpers
// ---------------------------------------------------------------------------

/** Prim's MST over points with Manhattan distance; preserves extra node properties. */
export function manhattanMst<T extends Pt>(nodes: T[]): Array<{ a: T; b: T; d: number }> {
  const edges: Array<{ a: T; b: T; d: number }> = [];
  if (nodes.length < 2) return edges;
  const manhattan = (p: Pt, q: Pt) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
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
    edges.push({ a: nodes[bestA], b: nodes[bestB], d: bestD });
    inTree.push(bestB);
    rest.splice(rest.indexOf(bestB), 1);
  }
  return edges;
}

/**
 * Junction dots needed after drawing `newWires`: the endpoint of one new wire
 * landing mid-span on a same-net segment (of another new wire or of an
 * existing same-net polyline). Endpoint-to-endpoint contacts need no dot.
 * Mirrors PHASE 4 of optimizePlacement.mjs.
 */
export function junctionPointsFor(
  newWires: Polyline[],
  existingSameNet: Polyline[] = [],
): Array<[number, number]> {
  const jset = new Set<string>();
  const candidates: Polyline[] = [...newWires, ...existingSameNet];
  for (const w of newWires) {
    for (const end of [w.pts[0], w.pts[w.pts.length - 1]]) {
      for (const other of candidates) {
        if (other === w) continue;
        if (other.net !== w.net) continue;
        for (let i = 0; i + 1 < other.pts.length; i++) {
          const s: Seg = [
            { x: other.pts[i][0], y: other.pts[i][1] },
            { x: other.pts[i + 1][0], y: other.pts[i + 1][1] },
          ];
          if (distPtSeg(end[0], end[1], s[0].x, s[0].y, s[1].x, s[1].y) < 1) {
            const isEndpoint = other.pts.some(
              (q) => Math.abs(q[0] - end[0]) < 1 && Math.abs(q[1] - end[1]) < 1,
            );
            if (!isEndpoint) jset.add(keyOf(end[0], end[1]));
          }
        }
      }
    }
  }
  return [...jset].map((k) => k.split(",").map(Number) as [number, number]);
}
