import * as z from "zod/v4";
import type { AltiumBridge } from "../bridge/altiumBridge.js";
import { runWirePins } from "./wirePins.js";
import { fetchSchematicAuditData } from "./schematicAuditData.js";
import { componentKeepOutRects } from "./schematicRouter.js";
import {
  anchoredOrigin,
  fetchTemplatePinTables,
  findTemplatePin,
  listModuleTemplateNames,
  loadModuleTemplate,
  planModuleInstance,
  preflightModuleInstance,
  type ModuleInstance,
} from "./moduleTemplates.js";

/** Axis-aligned rect as [x1, y1, x2, y2] (any corner order for bodies). */
type Rect = [number, number, number, number];

/** Estimated net-label text box: anchors bottom-left, extends right+up
 *  (Altium default 10pt stroke font ≈ 60 mil/char, ~110 mil line height). */
export function labelTextBox(name: string, x: number, y: number): Rect {
  return [x, y, x + 40 + 60 * name.length, y + 110];
}

function rectsOverlap(a: Rect, b: Rect, pad: number): boolean {
  const an = { x1: Math.min(a[0], a[2]), x2: Math.max(a[0], a[2]), y1: Math.min(a[1], a[3]), y2: Math.max(a[1], a[3]) };
  const bn = { x1: Math.min(b[0], b[2]), x2: Math.max(b[0], b[2]), y1: Math.min(b[1], b[3]), y2: Math.max(b[1], b[3]) };
  return !(an.x2 <= bn.x1 - pad || bn.x2 + pad <= an.x1 || an.y2 <= bn.y1 - pad || bn.y2 + pad <= an.y1);
}

/**
 * Pick a net-label anchor ON one of the net's own wires such that the text
 * box clears all obstacle rects (component bodies + already-placed labels/
 * ports). Candidates are sampled every 50 mil along each segment (vertices
 * included) so long names can slide into the free stretch of a wire.
 * Preference: horizontal segments first (labels read best), then lowest,
 * then leftmost. Falls back to a mid-vertex of the longest wire when every
 * candidate collides.
 */
export function pickLabelAnchor(
  name: string,
  wires: number[][][],
  obstacles: Rect[],
): { x: number; y: number; collision_free: boolean } {
  const cands: Array<{ x: number; y: number; horiz: boolean }> = [];
  for (const w of wires) {
    if (w.length < 2) continue;
    for (let i = 0; i + 1 < w.length; i++) {
      const [ax, ay] = w[i];
      const [bx, by] = w[i + 1];
      const horiz = ay === by;
      const len = Math.abs(horiz ? bx - ax : by - ay);
      const steps = Math.max(1, Math.floor(len / 50));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        cands.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, horiz });
      }
    }
  }
  cands.sort((a, b) => Number(b.horiz) - Number(a.horiz) || a.y - b.y || a.x - b.x);
  for (const c of cands) {
    if (!obstacles.some((o) => rectsOverlap(labelTextBox(name, c.x, c.y), o, 15))) {
      return { x: c.x, y: c.y, collision_free: true };
    }
  }
  const longest = wires.reduce((a, b) => (b.length >= a.length ? b : a), [] as number[][]);
  const mid = longest[Math.floor(longest.length / 2)];
  return { x: mid?.[0] ?? 0, y: mid?.[1] ?? 0, collision_free: false };
}

/**
 * instantiate_module: one-call generation of a company-standard circuit block
 * on a real sheet — the stage-0 "template -> drawing" link for SERIES
 * schematic generation. The model supplies template name + parameters + where
 * the block goes; the tool does everything else:
 *
 *   1. preflight  — validate symbols/pins against library pin tables
 *                   (fail-fast, ZERO side effects on wrong templates)
 *   2. allocate   — designators auto-assigned per sheet (no collisions with
 *                   existing components; multiple instances just work)
 *   3. place      — components at template layout offsets + origin
 *   4. wire       — each template net via wire_pins (real pin hotspots,
 *                   obstacle-avoiding routing, auto junctions)
 *   5. terminate  — GND/VCC power ports and net labels on interface nets
 *   6. parameterize — component values from params
 *   7. verify     — compiled netlist must contain every template net with
 *                   exactly the planned pin membership (subset check)
 */

export const instantiateModuleInputSchema = z.object({
  template: z.string().min(1).describe("Template name (see list_module_templates), e.g. buck-input-stage."),
  schematic_full_path: z.string().optional().describe("Absolute path of the target .SchDoc (preferred scoping)."),
  project_full_path: z.string().optional().describe("Absolute path of an open .PrjPcb."),
  schematic_sheet_file_name: z.string().optional().describe("Sheet file name, e.g. Sheet1.SchDoc."),
  origin_x_mils: z.number().int().describe("Module origin X (mils) — layout offsets are relative to this."),
  origin_y_mils: z.number().int().describe("Module origin Y (mils)."),
  params: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional()
    .describe("Template parameter overrides, e.g. {\"c_bulk_uf\": 220, \"r_uv1_k\": 150}. Unknown keys are errors."),
  verify: z.boolean().optional().default(true).describe("Compile and verify the module nets after drawing (default true)."),
});

export type InstantiateModuleInput = z.infer<typeof instantiateModuleInputSchema>;

export const listModuleTemplatesInputSchema = z.object({});

async function edit(bridge: AltiumBridge, sheet: Record<string, unknown>, params: Record<string, unknown>) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action} failed: ${String(res.error).split("\n")[0]}`);
  return ((res.result ?? {}) as { details?: Record<string, unknown> }).details ?? {};
}

export async function runInstantiateModule(
  bridge: AltiumBridge,
  input: InstantiateModuleInput,
): Promise<Record<string, unknown>> {
  const sheet: Record<string, unknown> = {};
  if (input.schematic_full_path) sheet.schematic_full_path = input.schematic_full_path;
  if (input.project_full_path) sheet.project_full_path = input.project_full_path;
  if (input.schematic_sheet_file_name) sheet.schematic_sheet_file_name = input.schematic_sheet_file_name;

  const template = loadModuleTemplate(input.template);

  // --- 1. existing designators on the sheet -------------------------------
  const dataRes = await bridge.executeCommand(
    "get_schematic_data",
    { ...sheet, include_queries: ["components"] },
    { timeoutMs: 240_000 },
  );
  if (!dataRes.success) {
    return { ok: false, error: `cannot read sheet: ${String(dataRes.error).split("\n")[0]}` };
  }
  const existing = ((dataRes.result ?? {}) as {
    components?: Array<{ designator?: string }>;
  }).components ?? [];
  const existingDesignators = existing
    .filter((c) => typeof c.designator === "string")
    .map((c) => c.designator as string);

  // --- 2. plan (allocate designators, resolve params) ----------------------
  let instance: ModuleInstance;
  try {
    instance = planModuleInstance(
      template,
      existingDesignators,
      { x_mils: input.origin_x_mils, y_mils: input.origin_y_mils },
      input.params,
    );
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // --- 3. preflight: symbols + pin refs against real library tables --------
  const tables = await fetchTemplatePinTables(bridge, template);
  if (!tables.ok) {
    return {
      ok: false,
      error: `library preflight failed (focus the project owning the .SchLib files and retry): ${tables.error}`,
    };
  }
  const issues = preflightModuleInstance(instance, template, tables.tables);
  if (issues.length > 0) {
    return {
      ok: false,
      stage: "preflight",
      error: "template does not match the focused project's libraries — NOTHING was drawn. Fix the template or open the right project.",
      issues,
      hint: "check lib_reference spelling and pin numbers against pin_table output; slotTables came from " + tables.rawCount + " enumerated components",
    };
  }

  // --- 4. place components --------------------------------------------------
  const placed: Array<{
    slot: string;
    designator: string;
    x: number;
    y: number;
    rotation: number;
    anchor_pin?: string;
    anchor_delta_mils?: { dx: number; dy: number };
  }> = [];
  for (const c of instance.components) {
    // anchor-pin slots: layout offset is the pin-hotspot TARGET; the origin
    // is solved from the library pin table (rotation-matrix path) and then
    // verified by readback with an automatic transform nudge on mismatch.
    let placeX = c.x_mils;
    let placeY = c.y_mils;
    if (c.anchor_pin !== undefined) {
      const pin = findTemplatePin(tables.tables, c.lib_reference, c.anchor_pin);
      if (!pin) {
        return {
          ok: false,
          stage: "place",
          error: `anchor_pin "${c.anchor_pin}" not found on ${c.lib_reference} (slot ${c.slot})`,
        };
      }
      const o = anchoredOrigin(pin, c.rotation_deg, {
        x: c.anchor_target_x_mils ?? c.x_mils,
        y: c.anchor_target_y_mils ?? c.y_mils,
      });
      placeX = Math.round(o.x);
      placeY = Math.round(o.y);
    }
    await edit(bridge, sheet, {
      action: "place_component",
      lib_reference: c.lib_reference,
      designator: c.designator,
      x_mils: placeX,
      y_mils: placeY,
      rotation_deg: c.rotation_deg,
    });
    let anchorDelta: { dx: number; dy: number } | undefined;
    if (c.anchor_pin !== undefined) {
      const info = await edit(bridge, sheet, { action: "get_component_info", designator: c.designator });
      const actual = ((info.pins ?? []) as Array<{ designator?: string; x_mils?: number; y_mils?: number }>).find(
        (p) => String(p.designator).toLowerCase() === c.anchor_pin!.toLowerCase(),
      );
      if (actual && typeof actual.x_mils === "number" && typeof actual.y_mils === "number") {
        const dx = Math.round(actual.x_mils - (c.anchor_target_x_mils ?? c.x_mils));
        const dy = Math.round(actual.y_mils - (c.anchor_target_y_mils ?? c.y_mils));
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          await edit(bridge, sheet, {
            action: "set_component_transform",
            designator: c.designator,
            x_mils: placeX - dx,
            y_mils: placeY - dy,
          });
          placeX -= dx;
          placeY -= dy;
          anchorDelta = { dx, dy };
        }
      }
    }
    placed.push({
      slot: c.slot,
      designator: c.designator,
      x: placeX,
      y: placeY,
      rotation: c.rotation_deg,
      anchor_pin: c.anchor_pin,
      anchor_delta_mils: anchorDelta,
    });
  }

  // --- 5. wire each net (wire_pins: real pins, routing, junctions) ----------
  const netReports: Array<Record<string, unknown>> = [];
  let wiringOk = true;
  for (const net of instance.nets) {
    const r = await runWirePins(bridge, { ...sheet, net_name: net.name, pins: net.pins, verify: false });
    netReports.push({
      net: net.name,
      pins: net.pins,
      wires: r.wires ?? [],
      wires_drawn: r.wires_drawn ?? 0,
      ok: r.ok !== false,
    });
    if (r.ok === false) wiringOk = false;
  }

  // keep-out hulls for label collision avoidance: MEASURED pin hotspots +
  // origin per component (rotation-proof; exported bboxes are not)
  let bodyRects: Rect[] = [];
  try {
    const audit = await fetchSchematicAuditData(bridge, sheet);
    bodyRects = componentKeepOutRects(audit.pins, audit.components);
  } catch {
    /* label placement falls back to legacy anchors without hull data */
  }

  // --- 6. terminations: power ports + net labels ----------------------------
  const textObstacles: Rect[] = [...bodyRects];
  for (const net of instance.nets) {
    const rep = netReports.find((n) => n.net === net.name) as { wires?: number[][][] } | undefined;
    const firstWire = rep?.wires?.[0];
    const anchor = firstWire?.[0] ?? null; // a real pin hotspot / route vertex
    if (net.termination === "gnd" && anchor) {
      const d = await edit(bridge, sheet, { action: "place_gnd", x_mils: anchor[0], y_mils: anchor[1] });
      textObstacles.push([anchor[0] - 60, anchor[1] - 120, anchor[0] + 60, anchor[1] + 80]);
      void d;
    } else if (net.termination === "vcc" && anchor) {
      const d = await edit(bridge, sheet, { action: "place_vcc", x_mils: anchor[0], y_mils: anchor[1] });
      textObstacles.push([anchor[0] - 60, anchor[1] - 120, anchor[0] + 60, anchor[1] + 80]);
      void d;
    } else if (net.termination === "label" && rep?.wires?.length) {
      // collision-aware anchor: candidate points on the net's own wires
      // (vertices + segment midpoints), text box must clear component bodies
      // and previously placed labels/ports
      const a = pickLabelAnchor(net.name, rep.wires, textObstacles);
      await edit(bridge, sheet, { action: "add_net_label", net_name: net.name, x_mils: Math.round(a.x), y_mils: Math.round(a.y) });
      textObstacles.push(labelTextBox(net.name, a.x, a.y));
    }
  }

  // --- 7. component values ---------------------------------------------------
  let valuesSet = 0;
  for (const c of instance.components) {
    if (!c.value) continue;
    await edit(bridge, sheet, {
      action: "set_component_parameters",
      designator: c.designator,
      parameter_names: ["Value"],
      parameter_values: [c.value],
    });
    valuesSet += 1;
  }

  const result: Record<string, unknown> = {
    ok: wiringOk,
    template: template.name,
    origin: { x_mils: input.origin_x_mils, y_mils: input.origin_y_mils },
    components_placed: placed,
    values_set: valuesSet,
    params_used: instance.params_used,
    nets: netReports.map((n) => ({ net: n.net, pins: n.pins, wires_drawn: n.wires_drawn, ok: n.ok })),
    note: "does not auto-save — verify in Altium, then Ctrl+S",
  };

  // --- 8. verification: module nets subset of the compiled partition --------
  if (input.verify) {
    const auditRes = await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 });
    const audit = (auditRes.result ?? {}) as {
      pin_nets?: Array<{ designator?: string; pin?: string; net?: string; unconnected?: boolean }>;
    };
    const byNet = new Map<string, string[]>();
    for (const row of audit.pin_nets ?? []) {
      if (row.unconnected || !row.designator || !row.pin) continue;
      const l = byNet.get(row.net ?? "") ?? [];
      l.push(`${row.designator}.${row.pin}`);
      byNet.set(row.net ?? "", l);
    }
    const actualSets = new Map([...byNet.entries()].map(([n, l]) => [[...l].sort().join(" | "), n]));
    const checks = instance.nets.map((n) => {
      const key = [...n.pins].sort().join(" | ");
      const compiledName = actualSets.get(key);
      return { net: n.name, pins_ok: compiledName !== undefined, compiled_as: compiledName ?? "(not found)" };
    });
    const allOk = checks.every((c) => c.pins_ok);
    result.verification = {
      all_module_nets_compiled: allOk,
      checks,
      compiled_net_count: byNet.size,
    };
    result.ok = wiringOk && allOk;
    if (!allOk) {
      result.error =
        "verification failed: some module nets did not compile with the planned pin membership — " +
        "delete the module components (edit_schematic delete_object) and report the template issue.";
    }
  }
  return result;
}

export async function runListModuleTemplates(): Promise<Record<string, unknown>> {
  const names = listModuleTemplateNames();
  const templates = names.map((n) => {
    try {
      const t = loadModuleTemplate(n);
      return {
        name: t.name,
        category: t.category ?? "",
        description: t.description ?? "",
        components: t.components.length,
        nets: t.nets.length,
        params: (t.params ?? []).map((p) => `${p.name}=${p.default}`),
      };
    } catch (e) {
      return { name: n, error: (e as Error).message };
    }
  });
  return { ok: true, count: templates.length, templates };
}
