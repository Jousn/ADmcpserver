import * as z from "zod/v4";
import type { AltiumBridge } from "../bridge/altiumBridge.js";
import { analyzeConnectivity } from "./checkConnectivity.js";
import { fetchSchematicAuditData, type SchematicAuditData } from "./schematicAuditData.js";
import { analyzeSchematicQuality } from "./analyzeSchematicQuality.js";
import {
  type Polyline,
  junctionPointsFor,
  keyOf,
  manhattanMst,
  pinNetMapOf,
  partitionOf,
  routePair,
} from "./schematicRouter.js";

/**
 * optimize_layout: one-shot placement + rewiring optimization.
 *
 * Ported from trash/test/optimizePlacement.mjs (2026-09-04 run: hill climb
 * 594 -> 292 estimated score over 12 sweeps, full re-route of 18 nets,
 * netlist partition identical, errors=0).
 *
 * Phases:
 *   1. fetch baseline (components, pins, wires, compiled pin nets)
 *   2. hill climb IN MEMORY (estimator sandbox, zero AD writes): candidates =
 *      4 rotations x 6 move deltas per component, component-overlap constraint
 *   3. apply transforms (one bridge call)
 *   4. re-read REAL pin positions from Altium, delete all wires, re-route
 *      every net from scratch (net-aware router), auto junctions (one bridge call)
 *   5. verify: netlist partition must be IDENTICAL to baseline; else report failure
 *
 * Safety: if planning/routing throws after transforms were applied, the sheet
 * is automatically restored (original transforms + original wires + junctions)
 * before the error is reported.
 */

export const optimizeLayoutInputSchema = z.object({
  schematic_full_path: z.string().optional().describe("Absolute path of the .SchDoc (preferred scoping)."),
  project_full_path: z.string().optional().describe("Absolute path of an open .PrjPcb."),
  schematic_sheet_file_name: z.string().optional().describe("Sheet file name, e.g. Sheet1.SchDoc."),
  max_sweeps: z
    .number()
    .int()
    .min(1)
    .max(40)
    .optional()
    .default(12)
    .describe("Hill-climb sweep budget; stops early when no improving neighbor exists (default 12)."),
  apply: z
    .boolean()
    .optional()
    .default(true)
    .describe("Apply the result to the sheet (transforms + full rewire). false = plan only, report what would change."),
  verify: z
    .boolean()
    .optional()
    .default(true)
    .describe("Re-audit the sheet after applying and verify the netlist partition is unchanged (default true)."),
});

export type OptimizeLayoutInput = z.infer<typeof optimizeLayoutInputSchema>;

// ---------------------------------------------------------------------------
// Geometry helpers (same semantics as analyzeSchematicQuality.applyTransforms)
// ---------------------------------------------------------------------------

interface CompState {
  x: number;
  y: number;
  rotation: number;
}

function rotateVec(x: number, y: number, deg: number): { x: number; y: number } {
  const r = ((Math.round(deg) % 360) + 360) % 360;
  if (r === 0) return { x, y };
  if (r === 90) return { x: -y, y: x };
  if (r === 180) return { x: -x, y: -y };
  return { x: y, y: -x };
}

/** Simulated bbox of a component under a cumulative (absolute) transform state. */
function simRect(
  orig: { x: number; y: number; width: number; height: number; rotation: number },
  t: CompState,
): { left: number; right: number; bottom: number; top: number } {
  const delta = t.rotation - orig.rotation;
  const odd = ((Math.round(delta) % 180) + 360) % 360 === 90;
  const w = odd ? orig.height : orig.width;
  const h = odd ? orig.width : orig.height;
  const cx = orig.x + orig.width / 2;
  const cy = orig.y + orig.height / 2;
  const off = rotateVec(cx - orig.x, cy - orig.y, delta);
  const ncx = t.x + off.x;
  const ncy = t.y + off.y;
  return { left: ncx - w / 2, right: ncx + w / 2, bottom: ncy - h / 2, top: ncy + h / 2 };
}

function rectsOverlap(a: { left: number; right: number; bottom: number; top: number }, b: typeof a): boolean {
  return a.left < b.right - 25 && b.left < a.right - 25 && a.bottom < b.top - 25 && b.bottom < a.top - 25;
}

// ---------------------------------------------------------------------------
// Hill climb (pure — testable without Altium)
// ---------------------------------------------------------------------------

export interface HillClimbResult {
  initialScore: number;
  finalScore: number;
  sweeps: number;
  converged: boolean;
  changes: Array<{
    designator: string;
    from: CompState;
    to: CompState;
  }>;
  finalState: Map<string, CompState>;
}

const MOVE_DELTAS = [-300, -200, -100, 100, 200, 300];

export function hillClimbPlacement(
  data: SchematicAuditData,
  maxSweeps: number,
): HillClimbResult {
  const origByDes = new Map(data.components.map((c) => [c.designator, c]));
  const state = new Map<string, CompState>(
    data.components.map((c) => [c.designator, { x: c.x, y: c.y, rotation: c.rotation }]),
  );

  const transformsOf = (st: Map<string, CompState>) =>
    [...st.entries()].map(([designator, t]) => ({
      designator,
      x_mils: t.x,
      y_mils: t.y,
      rotation_deg: t.rotation,
    }));
  const scoreOf = (st: Map<string, CompState>): number =>
    analyzeSchematicQuality(data, { transforms: transformsOf(st), suggestRotations: false })
      .hypothetical!.estimated.score;

  let cur = scoreOf(state);
  const initialScore = cur;

  const overlaps = (des: string, cand: CompState, st: Map<string, CompState>): boolean => {
    const orig = origByDes.get(des);
    if (!orig) return true;
    const r1 = simRect(orig, cand);
    for (const [od, ot] of st) {
      if (od === des) continue;
      const o = origByDes.get(od);
      if (!o) continue;
      if (rectsOverlap(r1, simRect(o, ot))) return true;
    }
    return false;
  };

  let sweeps = 0;
  let converged = false;
  for (let sweep = 1; sweep <= maxSweeps; sweep++) {
    let best: { des: string; cand: CompState; score: number } | null = null;
    for (const [des, t] of state) {
      for (const r of [0, 90, 180, 270]) {
        if (r === ((Math.round(t.rotation) % 360) + 360) % 360) continue;
        const cand = { x: t.x, y: t.y, rotation: r };
        if (overlaps(des, cand, state)) continue;
        state.set(des, cand);
        const s = scoreOf(state);
        state.set(des, t);
        if (s < cur && (best === null || s < best.score)) best = { des, cand, score: s };
      }
      for (const dx of MOVE_DELTAS) {
        for (const dy of MOVE_DELTAS) {
          const cand = { x: t.x + dx, y: t.y + dy, rotation: t.rotation };
          if (overlaps(des, cand, state)) continue;
          state.set(des, cand);
          const s = scoreOf(state);
          state.set(des, t);
          if (s < cur && (best === null || s < best.score)) best = { des, cand, score: s };
        }
      }
    }
    sweeps = sweep;
    if (!best) {
      converged = true;
      break;
    }
    state.set(best.des, best.cand);
    cur = best.score;
  }

  const changes: HillClimbResult["changes"] = [];
  for (const [des, t] of state) {
    const o = origByDes.get(des);
    if (!o) continue;
    if (o.x !== t.x || o.y !== t.y || o.rotation !== t.rotation) {
      changes.push({ designator: des, from: { x: o.x, y: o.y, rotation: o.rotation }, to: t });
    }
  }
  return { initialScore, finalScore: cur, sweeps, converged, changes, finalState: state };
}

// ---------------------------------------------------------------------------
// Full-sheet rewiring plan (pure)
// ---------------------------------------------------------------------------

export interface RewirePlan {
  wires: Polyline[];
  junctions: Array<[number, number]>;
  /** Original wires/junctions snapshot — used by the restore fallback. */
  originalWires: Polyline[];
  originalJunctions: Array<[number, number]>;
}

/**
 * Re-route EVERY net of the sheet from pin positions `pins` and net membership
 * `pinNets` (baseline compiled nets — NOT a post-move compile, which would see
 * stale wires). Ports join the pin-net of the same name; port-port edges are
 * skipped (same-name power ports are connected by name already).
 */
export function planFullRewire(
  pins: SchematicAuditData["pins"],
  ports: SchematicAuditData["ports"],
  pinNets: SchematicAuditData["pinNets"],
  originalWires: SchematicAuditData["wires"],
  originalJunctions: SchematicAuditData["junctions"],
): RewirePlan {
  const pinNetOf = pinNetMapOf(pinNets);
  const pinById = new Map(pins.map((p) => [`${p.designator}.${p.pinDesignator || p.pinName}`, p]));

  // Cross-net hotspot collision guard (same rationale as wire_pins): two pins
  // sharing an exact coordinate cannot be wired as separate nets. Wiring would
  // silently merge them — fail BEFORE any sheet mutation instead.
  {
    const owners = new Map<string, Array<{ pin: string; net: string }>>();
    for (const [pk, p] of pinById) {
      if (p.isHidden) continue;
      const k = `${Math.round(p.x)},${Math.round(p.y)}`;
      const list = owners.get(k) ?? [];
      list.push({ pin: pk, net: pinNetOf.get(pk) ?? "" });
      owners.set(k, list);
    }
    const clashes: string[] = [];
    for (const [k, list] of owners) {
      const nets = new Set(list.map((o) => o.net));
      if (nets.size > 1) {
        clashes.push(`(${k}): ${list.map((o) => `${o.pin}[${o.net || "floating"}]`).join(" + ")}`);
      }
    }
    if (clashes.length > 0) {
      throw new Error(
        `pin hotspot collisions — pins of different nets share exact coordinates and cannot be rewired: ` +
          `${clashes.join("; ")}. Move the overlapping components apart first ` +
          `(edit_schematic set_component_transform, ~300 mil), then retry optimize_layout.`,
      );
    }
  }

  const netNodes = new Map<string, Array<{ x: number; y: number; port: boolean }>>();
  for (const [pk, net] of pinNetOf) {
    const p = pinById.get(pk);
    if (!p || p.isHidden) continue;
    const list = netNodes.get(net) ?? [];
    list.push({ x: p.x, y: p.y, port: false });
    netNodes.set(net, list);
  }
  for (const port of ports) {
    if (!netNodes.has(port.net)) continue; // net exists only as port: nothing to wire
    netNodes.get(port.net)!.push({ x: port.x, y: port.y, port: true });
  }

  const obstacles: Polyline[] = [];
  const wires: Polyline[] = [];
  for (const [net, nodes] of netNodes) {
    if (nodes.length < 2) continue;
    const edges = manhattanMst(nodes).sort((e1, e2) => e1.d - e2.d);
    for (const e of edges) {
      if (e.a.port && e.b.port) continue; // port-port: connected by name
      const a: [number, number] = [e.a.x, e.a.y];
      const b: [number, number] = [e.b.x, e.b.y];
      const pts = routePair(a, b, {
        net,
        pins,
        pinNetOf,
        obstacles,
        allowedContacts: new Set([keyOf(a[0], a[1]), keyOf(b[0], b[1])]),
      });
      if (pts.length < 2) continue;
      wires.push({ pts, net });
      obstacles.push({ pts, net });
    }
  }

  return {
    wires,
    junctions: junctionPointsFor(wires),
    originalWires: originalWires.map((w) => ({
      pts: w.vertices.map((v) => [v.x, v.y] as [number, number]),
      net: "",
    })),
    originalJunctions: originalJunctions.map((j) => [j.x, j.y] as [number, number]),
  };
}

// ---------------------------------------------------------------------------
// Bridge execution
// ---------------------------------------------------------------------------

function toSemiCsv(pts: Array<[number, number]>): string {
  return pts.map((p) => `${Math.round(p[0])};${Math.round(p[1])}`).join(";");
}

async function drawPlan(
  bridge: AltiumBridge,
  sheet: Record<string, unknown>,
  parts: {
    transforms?: Array<{ designator: string; x: number; y: number; rotation: number }>;
    deleteWiresAll?: boolean;
    wires?: Polyline[];
    junctions?: Array<[number, number]>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const params: Record<string, unknown> = { ...sheet, action: "draw_plan" };
  if (parts.transforms && parts.transforms.length > 0) {
    params.transforms_csv = parts.transforms.map(
      (t) => `${t.designator};${Math.round(t.x)};${Math.round(t.y)};${Math.round(t.rotation)}`,
    );
  }
  if (parts.deleteWiresAll) params.delete_wires_all = true;
  if (parts.wires && parts.wires.length > 0) {
    params.wires_csv = parts.wires.map((w) => toSemiCsv(w.pts));
  }
  if (parts.junctions && parts.junctions.length > 0) {
    params.junctions_csv = parts.junctions.map(([x, y]) => `${Math.round(x)};${Math.round(y)}`);
  }
  const resp = await bridge.executeCommand("schematic_edit", params, { timeoutMs: 240_000 });
  if (!resp.success) return { ok: false, error: String(resp.error ?? "draw_plan failed") };
  return { ok: true };
}

export async function runOptimizeLayout(
  bridge: AltiumBridge,
  input: OptimizeLayoutInput,
): Promise<Record<string, unknown>> {
  const sheet: Record<string, unknown> = {};
  if (input.schematic_full_path) sheet.schematic_full_path = input.schematic_full_path;
  if (input.project_full_path) sheet.project_full_path = input.project_full_path;
  if (input.schematic_sheet_file_name) sheet.schematic_sheet_file_name = input.schematic_sheet_file_name;

  const baseline = await fetchSchematicAuditData(bridge, sheet);
  if (baseline.pinNets.length === 0) {
    return {
      ok: false,
      error:
        "compiled net data unavailable (check_connectivity DM layer failed) — optimize_layout refuses " +
        "to rewire without knowing the netlist. Run compile_project in Altium and retry. " +
        `DM error was: ${baseline.dmError ?? "unknown"}`,
    };
  }
  const baselinePartition = partitionOf(baseline.pinNets);

  if (baseline.components.length === 0) {
    return {
      ok: false,
      error: "no components found on this sheet — nothing to optimize",
    };
  }

  const climb = hillClimbPlacement(baseline, input.max_sweeps);
  const result: Record<string, unknown> = {
    ok: true,
    estimated_score: { before: climb.initialScore, after: climb.finalScore },
    sweeps_used: climb.sweeps,
    converged: climb.converged,
    transforms_planned: climb.changes,
    applied: false,
  };

  if (!input.apply || climb.changes.length === 0) {
    result.message =
      climb.changes.length === 0
        ? "no improving transform found — layout already at a local optimum for this estimator"
        : "plan only (apply=false): nothing was modified. Re-run with apply=true to commit.";
    return result;
  }

  // --- Phase A: apply transforms (wires untouched) -------------------------
  let applyRes = await drawPlan(bridge, sheet, {
    transforms: climb.changes.map((c) => ({ designator: c.designator, ...c.to })),
  });
  if (!applyRes.ok) {
    return { ...result, ok: false, error: `transform apply failed: ${applyRes.error}` };
  }
  result.applied = true;

  // --- Phase B: re-read REAL pin positions, plan full rewire ---------------
  // Net membership comes from the BASELINE compile (wires are stale after the
  // moves; a fresh compile would report floats). This mirrors optimizePlacement.mjs.
  let rewire: RewirePlan;
  try {
    const post = await fetchSchematicAuditData(bridge, sheet);
    rewire = planFullRewire(
      post.pins,
      post.ports,
      baseline.pinNets,
      baseline.wires,
      baseline.junctions,
    );
  } catch (planErr) {
    // Restore original transforms + wires — do not leave a half-optimized sheet.
    const snapshot = planSnapshot(baseline);
    const restore = await drawPlan(bridge, sheet, {
      transforms: climb.changes.map((c) => ({ designator: c.designator, ...c.from })),
      deleteWiresAll: true,
      wires: snapshot.wires,
      junctions: snapshot.junctions,
    });
    return {
      ...result,
      ok: false,
      restored: restore.ok,
      error: `rewire planning failed after transforms were applied: ${(planErr as Error).message}` +
        (restore.ok
          ? " — sheet RESTORED to the pre-optimization state (verify with check_connectivity)"
          : " — RESTORE ALSO FAILED; use Altium Undo (Ctrl+Z) and do not save"),
    };
  }

  // --- Phase C: delete all wires + draw the new routing + junctions --------
  applyRes = await drawPlan(bridge, sheet, {
    deleteWiresAll: true,
    wires: rewire.wires,
    junctions: rewire.junctions,
  });
  if (!applyRes.ok) {
    return {
      ...result,
      ok: false,
      error: `wire redraw failed: ${applyRes.error}. Original wires were deleted — restore via draw_plan with ` +
        `the wires/junctions snapshot in restore_snapshot of this response if needed.`,
      restore_snapshot: {
        transforms: climb.changes.map((c) => ({ designator: c.designator, ...c.from })),
        wires: rewire.originalWires.map((w) => w.pts.map((p) => [Math.round(p[0]), Math.round(p[1])])),
        junctions: rewire.originalJunctions.map(([x, y]) => [Math.round(x), Math.round(y)]),
      },
    };
  }
  result.wires_drawn = rewire.wires.length;
  result.junctions_drawn = rewire.junctions.length;
  result.net_count = new Set(baseline.pinNets.filter((r) => !r.unconnected).map((r) => r.net)).size;

  // --- Phase D: verification ----------------------------------------------
  if (input.verify) {
    const after = await fetchSchematicAuditData(bridge, sheet);
    const afterPartition = partitionOf(after.pinNets);
    const partitionOk =
      afterPartition.size === baselinePartition.size &&
      [...baselinePartition].every((x) => afterPartition.has(x));
    const audit = analyzeConnectivity(after);
    const quality = analyzeSchematicQuality(after, { suggestRotations: false });
    result.verification = {
      netlist_partition_identical: partitionOk,
      audit_summary: audit.summary,
      audit_errors: audit.errors,
      audit_warnings: audit.warnings,
      estimated_score_now: quality.current.estimated.score,
      actual_wires_now: quality.current.actual_wires,
    };
    if (!partitionOk) {
      result.ok = false;
      result.error =
        "NETLIST CHANGED after optimization — DO NOT SAVE. Diff (expected vs actual) is in " +
        "verification; use Altium Undo (Ctrl+Z) to revert and report this as a tool bug.";
    }
  }
  return result;
}

/** Original wires/junctions snapshot shaped for the restore path. */
function planSnapshot(baseline: SchematicAuditData): {
  wires: Polyline[];
  junctions: Array<[number, number]>;
} {
  return {
    wires: baseline.wires.map((w) => ({
      pts: w.vertices.map((v) => [v.x, v.y] as [number, number]),
      net: "",
    })),
    junctions: baseline.junctions.map((j) => [j.x, j.y] as [number, number]),
  };
}
