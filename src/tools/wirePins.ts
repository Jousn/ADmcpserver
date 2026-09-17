import * as z from "zod/v4";
import type { AltiumBridge } from "../bridge/altiumBridge.js";
import {
  analyzeConnectivity,
  type AuditPin,
} from "./checkConnectivity.js";
import { fetchSchematicAuditData, type SchematicAuditData } from "./schematicAuditData.js";
import {
  type Polyline,
  componentKeepOutRects,
  computeWireNets,
  junctionPointsFor,
  keyOf,
  manhattanMst,
  pinIdOf,
  pinNetMapOf,
  routePair,
} from "./schematicRouter.js";

/**
 * wire_pins: connect a list of pins of ONE net with orthogonal, obstacle-aware
 * wires — the model supplies TOPOLOGY (which pins belong together), never
 * coordinates. The tool reads pin hotspots itself, routes (A* on a mils grid,
 * foreign nets/pins as obstacles), auto-places junction dots at same-net
 * T-contacts, draws everything in ONE bridge call, and verifies the result.
 *
 * This is the promoted version of the router verified in trash/test/fixAndApply.mjs
 * (2026-09-04: 73 wires re-anchored, netlist partition identical, errors=0).
 */

export const wirePinsInputSchema = z.object({
  schematic_full_path: z
    .string()
    .optional()
    .describe("Absolute path of the .SchDoc (preferred scoping)."),
  project_full_path: z.string().optional().describe("Absolute path of an open .PrjPcb."),
  schematic_sheet_file_name: z.string().optional().describe("Sheet file name, e.g. Sheet1.SchDoc."),
  net_name: z
    .string()
    .min(1)
    .describe(
      "Name of the net being drawn, e.g. VCC, GND, LED1, SDA. Used for obstacle classification " +
        "(same-name existing wires/ports are joinable, everything else is an obstacle). " +
        "Place a net label / power port separately if the net needs a visible name.",
    ),
  pins: z
    .array(z.string().regex(/^[^.]+\..+$/, "pin must be DES.PIN, e.g. R1.2 or U1.14"))
    .min(2)
    .describe(
      "Pins to interconnect on this net, as designator.pin-number/name, e.g. [\"R1.2\", \"D1.1\"]. " +
        "Every listed pin must already be placed on the sheet.",
    ),
  verify: z
    .boolean()
    .optional()
    .default(true)
    .describe("After drawing, re-audit the sheet and report per-pin connectivity (default true)."),
});

export type WirePinsInput = z.infer<typeof wirePinsInputSchema>;

// ---------------------------------------------------------------------------
// Pure planning (testable without Altium)
// ---------------------------------------------------------------------------

export interface WirePinsPlan {
  wires: Polyline[];
  junctions: Array<[number, number]>;
  /** Resolved pin coordinates actually used as wire endpoints. */
  endpoints: Array<{ pin: string; x: number; y: number }>;
  grid_mils: number;
}

export function planWirePins(
  data: SchematicAuditData,
  input: { net_name: string; pins: string[] },
): WirePinsPlan {
  const visiblePins = data.pins.filter((p) => !p.isHidden);
  const byId = new Map<string, AuditPin>();
  for (const p of visiblePins) byId.set(pinIdOf(p), p);

  const unresolved: string[] = [];
  const endpoints: WirePinsPlan["endpoints"] = [];
  const seenCoord = new Set<string>();
  for (const raw of input.pins) {
    const id = raw.trim().toUpperCase();
    const p = byId.get(id) ?? byId.get(raw.trim());
    if (!p) {
      unresolved.push(raw);
      continue;
    }
    const k = keyOf(p.x, p.y);
    if (seenCoord.has(k)) continue; // two pins at the same hotspot (multi-part symbols)
    seenCoord.add(k);
    endpoints.push({ pin: `${p.designator}.${p.pinDesignator || p.pinName}`, x: p.x, y: p.y });
  }
  if (unresolved.length > 0) {
    throw new Error(
      `pin(s) not found on this sheet (check designator and pin number/name, and that the component is placed): ${unresolved.join(", ")}`,
    );
  }
  if (endpoints.length < 2) {
    throw new Error("after deduplication fewer than 2 distinct pin hotspots remain — nothing to wire");
  }

  // Cross-net hotspot collision guard: two pins of DIFFERENT nets at the exact
  // same coordinate cannot be wired individually — any wire landing there
  // connects both (classic cause: two components placed on top of each other,
  // e.g. SW1.2 and R2.1 sharing (2500,500)). Fail BEFORE drawing anything.
  const netPinSet = new Set(endpoints.map((e) => e.pin));
  const foreignAtHotspot = new Map<string, string[]>();
  for (const p of visiblePins) {
    const id = `${p.designator}.${p.pinDesignator || p.pinName}`;
    if (netPinSet.has(id)) continue;
    const k = keyOf(p.x, p.y);
    if (endpoints.some((e) => e.x === p.x && e.y === p.y)) {
      const list = foreignAtHotspot.get(k) ?? [];
      list.push(id);
      foreignAtHotspot.set(k, list);
    }
  }
  if (foreignAtHotspot.size > 0) {
    const clashes = [...foreignAtHotspot.entries()].map(([k, ids]) => {
      const owner = endpoints.find((e) => keyOf(e.x, e.y) === k);
      return `(${k}) ${owner?.pin} collides with ${ids.join(", ")}`;
    });
    throw new Error(
      `pin hotspot collision — a pin of this net shares its exact coordinate with a pin NOT in this net: ` +
        `${clashes.join("; ")}. Move one of the components apart first ` +
        `(edit_schematic set_component_transform, ~300 mil), then re-run wire_pins.`,
    );
  }

  // Existing wires: same-net wires are joinable, others are obstacles.
  const wireNets = computeWireNets(data.pins, data.wires, data.ports, data.pinNets);
  const obstacles: Polyline[] = data.wires
    .filter((w) => wireNets.get(w.index) !== input.net_name)
    .map((w) => ({
      pts: w.vertices.map((v) => [v.x, v.y] as [number, number]),
      net: String(wireNets.get(w.index) ?? "?"),
    }));
  const existingSameNet: Polyline[] = data.wires
    .filter((w) => wireNets.get(w.index) === input.net_name)
    .map((w) => ({
      pts: w.vertices.map((v) => [v.x, v.y] as [number, number]),
      net: input.net_name,
    }));

  const pinNetOf = pinNetMapOf(data.pinNets);
  // Sheet-native pin ids (resolved above) — matches the router's pk format
  // regardless of the case the caller used.
  const sameNetPins = new Set(endpoints.map((e) => e.pin));

  // Component bodies are no-go regions for routes. Derived from MEASURED pin
  // hotspots + origin (rotation-proof) — the exported BoundingRectangle is
  // unreliable for rotated symbols.
  const bodyRects = componentKeepOutRects(data.pins, data.components);

  // MST over the pin hotspots, short edges first (dense nets then tap onto
  // already-routed trunks instead of paralleling them).
  const nodes = endpoints.map((e) => ({ x: e.x, y: e.y }));
  const edges = manhattanMst(nodes).sort((e1, e2) => e1.d - e2.d);

  const wires: Polyline[] = [];
  let grid = 0;
  for (const e of edges) {
    const a: [number, number] = [e.a.x, e.a.y];
    const b: [number, number] = [e.b.x, e.b.y];
    const pts = routePair(a, b, {
      net: input.net_name,
      pins: data.pins,
      pinNetOf,
      sameNetPins,
      obstacles,
      allowedContacts: new Set([keyOf(a[0], a[1]), keyOf(b[0], b[1])]),
      bodyRects,
    });
    if (pts.length < 2) continue;
    wires.push({ pts, net: input.net_name });
    obstacles.push({ pts, net: input.net_name }); // planned routes are obstacles too
  }
  grid = wires.length > 0 ? inferGrid(wires) : 0;

  const junctions = junctionPointsFor(wires, existingSameNet);
  return { wires, junctions, endpoints, grid_mils: grid };
}

function inferGrid(wires: Polyline[]): number {
  const values = new Set<number>();
  for (const w of wires) {
    for (const [x, y] of w.pts) {
      values.add(x);
      values.add(y);
    }
  }
  for (const g of [100, 50, 20, 10]) {
    let ok = true;
    for (const v of values) {
      if (Math.abs(v / g - Math.round(v / g)) > 1e-6) {
        ok = false;
        break;
      }
    }
    if (ok) return g;
  }
  return 10;
}

// ---------------------------------------------------------------------------
// Bridge execution
// ---------------------------------------------------------------------------

/**
 * draw_plan encoding note: the Pascal line parser strips ALL quotes and commas
 * from array element lines (SchEditParseStringArray), so coordinates inside
 * array items use SEMICOLONS: "x1;y1;x2;y2".
 */
function toSemiCsv(pts: Array<[number, number]>): string {
  return pts.map((p) => `${Math.round(p[0])};${Math.round(p[1])}`).join(";");
}

export async function runWirePins(
  bridge: AltiumBridge,
  input: WirePinsInput,
): Promise<Record<string, unknown>> {
  const sheet: Record<string, unknown> = {};
  if (input.schematic_full_path) sheet.schematic_full_path = input.schematic_full_path;
  if (input.project_full_path) sheet.project_full_path = input.project_full_path;
  if (input.schematic_sheet_file_name) sheet.schematic_sheet_file_name = input.schematic_sheet_file_name;

  const before = await fetchSchematicAuditData(bridge, sheet);
  const plan = planWirePins(before, { net_name: input.net_name, pins: input.pins });

  if (plan.wires.length === 0) {
    return {
      ok: true,
      net_name: input.net_name,
      wires_drawn: 0,
      junctions_drawn: 0,
      message: "all listed pin hotspots already coincide — nothing to draw",
      endpoints: plan.endpoints,
    };
  }

  const params: Record<string, unknown> = {
    ...sheet,
    action: "draw_plan",
    wires_csv: plan.wires.map((w) => toSemiCsv(w.pts)),
  };
  if (plan.junctions.length > 0) {
    params.junctions_csv = plan.junctions.map(([x, y]) => `${Math.round(x)};${Math.round(y)}`);
  }
  const resp = await bridge.executeCommand("schematic_edit", params, { timeoutMs: 240_000 });
  if (!resp.success) {
    return {
      ok: false,
      error: String(resp.error ?? "draw_plan bridge call failed"),
      net_name: input.net_name,
      planned_wires: plan.wires,
    };
  }

  const result: Record<string, unknown> = {
    ok: true,
    net_name: input.net_name,
    wires_drawn: plan.wires.length,
    junctions_drawn: plan.junctions.length,
    grid_mils: plan.grid_mils,
    endpoints: plan.endpoints,
    wires: plan.wires.map((w) => w.pts.map((p) => [Math.round(p[0]), Math.round(p[1])])),
    junctions: plan.junctions.map(([x, y]) => [Math.round(x), Math.round(y)]),
    note: "wire coordinates come from actual pin hotspots read back from Altium — treat them as the ground truth for any follow-up edit",
  };

  if (input.verify) {
    const after = await fetchSchematicAuditData(bridge, sheet);
    const audit = analyzeConnectivity(after);
    const listed = new Set(plan.endpoints.map((e) => e.pin));
    const netOf = new Map<string, string>();
    for (const r of after.pinNets) {
      if (r.unconnected) continue;
      netOf.set(`${r.designator}.${r.pin}`, r.net);
    }
    const netsHit = new Set<string>();
    const floating: string[] = [];
    for (const p of listed) {
      const n = netOf.get(p);
      if (!n) floating.push(p);
      else netsHit.add(n);
    }
    const oneNet = floating.length === 0 && netsHit.size === 1;
    result.verification = {
      all_pins_on_one_net: oneNet,
      actual_net_name: netsHit.size === 1 ? [...netsHit][0] : [...netsHit],
      still_floating: floating,
      audit_summary: audit.summary,
      audit_errors: audit.errors,
      audit_warnings: audit.warnings,
    };
    if (!oneNet) {
      result.ok = false;
      result.error =
        `verification failed: listed pins are not all on one net ` +
        `(${[...netsHit].join(", ")}${floating.length ? "; floating: " + floating.join(", ") : ""}). ` +
        `Delete the offending wires (edit_schematic delete_object) and re-run wire_pins.`;
    }
  }
  return result;
}
