import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinHotspotOffsetAtRot0, rotateOffsetCCW, type PinTableEntry, type PinTablePin } from "./pinTable.js";
import { buildPinTable, fetchLibraryComponents, type RawLibraryComponent } from "./pinTable.js";
import type { AltiumBridge } from "../bridge/altiumBridge.js";

/**
 * Module templates — the stage-0 asset for SERIES schematic generation.
 *
 * A template captures one company-standard circuit block as DATA (not prose):
 *   - components[]: BOM skeleton with slot names, lib_references, prefixes
 *   - layout: slot -> relative origin offset (the block's drawing convention)
 *   - nets[]: the block's internal golden netlist in SLOT.PIN form
 *     (designator-agnostic — designators are allocated per sheet at
 *      instantiation so multiple instances never collide)
 *   - params[]: parameterized component values with defaults
 *
 * instantiate_module turns (template, params, origin) into a placed + wired +
 * verified block on a real sheet by driving the existing pipeline tools
 * (place_component / wire_pins / place_gnd / add_net_label /
 * set_component_parameters / check_connectivity).
 */

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export interface ParamValue {
  param: string;
  unit?: string;
}

export interface TemplateComponent {
  /** Symbolic name used by nets[] and layout (e.g. "R_UV1"). */
  slot: string;
  lib_reference: string;
  /** Designator prefix, e.g. "R". */
  prefix: string;
  rotation_deg?: number;
  /**
   * Anchor-pin placement: when set, the layout offset for this slot means
   * "this PIN's hotspot lands at (module origin + offset)" — the component
   * origin is then wherever the symbol geometry dictates (computed from the
   * library pin table). Neutralizes AD's origin-pivot rotation swings
   * (origins are usually off-center, so rotating moves everything).
   */
  anchor_pin?: string;
  /** Static value ("100k"), parameterized ({param, unit}), or null. */
  value?: string | ParamValue | null;
}

export type NetTermination = "label" | "gnd" | "vcc" | "none";

export interface TemplateNet {
  name: string;
  /** Net members as SLOT.PIN — pin is the library pin NUMBER. */
  pins: string[];
  termination?: NetTermination;
}

export interface TemplateParam {
  name: string;
  default: number | string;
  description?: string;
}

export interface ModuleTemplate {
  name: string;
  version: number;
  category?: string;
  description?: string;
  author?: string;
  components: TemplateComponent[];
  /** slot -> [dx, dy] offset from the module origin, mils. */
  layout: Record<string, [number, number]>;
  nets: TemplateNet[];
  params?: TemplateParam[];
  notes?: string[];
}

// ---------------------------------------------------------------------------
// Loader / registry
// ---------------------------------------------------------------------------

/** templates/ lives at the MCP project root (parent of dist/ or src/). */
function templatesRootDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/tools/ or src/tools/
  return join(here, "..", "..", "templates");
}

export function loadModuleTemplate(name: string): ModuleTemplate {
  const safe = name.replace(/[^A-Za-z0-9_-]/g, "");
  const p = join(templatesRootDir(), `${safe}.json`);
  if (!existsSync(p)) {
    throw new Error(
      `template "${name}" not found (${p}). Available: ${listModuleTemplateNames().join(", ") || "(none)"}`,
    );
  }
  const raw = JSON.parse(readFileSync(p, "utf8")) as ModuleTemplate;
  validateTemplate(raw, name);
  return raw;
}

export function listModuleTemplateNames(): string[] {
  const dir = templatesRootDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function validateTemplate(t: ModuleTemplate, source: string): void {
  const problems: string[] = [];
  if (!t.name) problems.push("missing name");
  if (!Array.isArray(t.components) || t.components.length === 0) problems.push("components[] empty");
  if (!Array.isArray(t.nets) || t.nets.length === 0) problems.push("nets[] empty");
  const slots = new Set((t.components ?? []).map((c) => c.slot));
  for (const c of t.components ?? []) {
    if (!c.slot || !c.lib_reference || !c.prefix) problems.push(`component entry incomplete: ${JSON.stringify(c)}`);
    if (!(t.layout?.[c.slot])) problems.push(`layout missing offset for slot ${c.slot}`);
  }
  for (const n of t.nets ?? []) {
    if (!n.name || !Array.isArray(n.pins) || n.pins.length === 0) problems.push(`net entry incomplete: ${JSON.stringify(n)}`);
    for (const p of n.pins ?? []) {
      const dot = p.indexOf(".");
      if (dot <= 0 || dot === p.length - 1) problems.push(`net "${n.name}" pin "${p}" not in SLOT.PIN form`);
      else if (!slots.has(p.slice(0, dot))) problems.push(`net "${n.name}" pin "${p}" references unknown slot`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`template "${source}" invalid: ${problems.join("; ")}`);
  }
}

// ---------------------------------------------------------------------------
// Instantiation planning (pure)
// ---------------------------------------------------------------------------

export interface InstantiatedComponent {
  slot: string;
  designator: string;
  lib_reference: string;
  prefix: string;
  x_mils: number;
  y_mils: number;
  rotation_deg: number;
  /** Pin number this slot anchors on (layout offset = anchor target), if any. */
  anchor_pin?: string;
  /** Absolute anchor-pin target (== origin + layout offset) when anchor_pin set. */
  anchor_target_x_mils?: number;
  anchor_target_y_mils?: number;
  value: string | null;
}

export interface InstantiatedNet {
  name: string;
  pins: string[]; // DESIGNATOR.PIN — ready for wire_pins
  termination: NetTermination;
}

export interface ModuleInstance {
  template: string;
  origin: { x_mils: number; y_mils: number };
  components: InstantiatedComponent[];
  nets: InstantiatedNet[];
  params_used: Record<string, string | number>;
}

/** Next free designator per prefix: max existing numeric suffix + 1 (per prefix, allocated in template order). */
export function allocateDesignators(
  template: ModuleTemplate,
  existingDesignators: string[],
): Record<string, string> {
  const used = new Set(existingDesignators.map((d) => d.trim().toUpperCase()));
  const counters = new Map<string, number>();
  const maxSuffix = new Map<string, number>();
  for (const d of used) {
    const m = /^(.*?)(\d+)$/.exec(d);
    if (!m) continue;
    const prefix = m[1].toUpperCase();
    const n = Number(m[2]);
    maxSuffix.set(prefix, Math.max(maxSuffix.get(prefix) ?? 0, n));
  }
  const out: Record<string, string> = {};
  for (const c of template.components) {
    const prefix = c.prefix.toUpperCase();
    let n = counters.get(prefix) ?? (maxSuffix.get(prefix) ?? 0);
    let des: string;
    do {
      n += 1;
      des = `${prefix}${n}`;
    } while (used.has(des));
    counters.set(prefix, n);
    used.add(des);
    out[c.slot] = des;
  }
  return out;
}

/** Resolve a component value: literal string, {param, unit} against inputs/defaults, or null. */
export function resolveValue(
  v: TemplateComponent["value"],
  paramsUsed: Record<string, string | number>,
  template: ModuleTemplate,
  slot: string,
): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  const paramDefs = new Map((template.params ?? []).map((p) => [p.name, p]));
  if (!paramDefs.has(v.param)) {
    throw new Error(`template "${template.name}" slot ${slot}: value references unknown param "${v.param}"`);
  }
  const raw = paramsUsed[v.param];
  if (raw === undefined) {
    throw new Error(`template "${template.name}" slot ${slot}: param "${v.param}" has no value and no default`);
  }
  return v.unit ? `${raw}${v.unit}` : String(raw);
}

/** Merge user params over template defaults; unknown user params are an error (typos must not pass silently). */
export function mergeParams(
  template: ModuleTemplate,
  userParams: Record<string, string | number> | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const p of template.params ?? []) out[p.name] = p.default;
  for (const [k, v] of Object.entries(userParams ?? {})) {
    if (!(k in out)) {
      throw new Error(
        `unknown param "${k}" for template "${template.name}" (accepted: ${Object.keys(out).join(", ") || "none"})`,
      );
    }
    out[k] = v;
  }
  return out;
}

export function planModuleInstance(
  template: ModuleTemplate,
  existingDesignators: string[],
  origin: { x_mils: number; y_mils: number },
  userParams?: Record<string, string | number>,
): ModuleInstance {
  const paramsUsed = mergeParams(template, userParams);
  const designators = allocateDesignators(template, existingDesignators);
  const components: InstantiatedComponent[] = template.components.map((c) => ({
    slot: c.slot,
    designator: designators[c.slot],
    lib_reference: c.lib_reference,
    prefix: c.prefix,
    x_mils: origin.x_mils + (template.layout[c.slot]?.[0] ?? 0),
    y_mils: origin.y_mils + (template.layout[c.slot]?.[1] ?? 0),
    rotation_deg: c.rotation_deg ?? 0,
    anchor_pin: c.anchor_pin,
    anchor_target_x_mils: origin.x_mils + (template.layout[c.slot]?.[0] ?? 0),
    anchor_target_y_mils: origin.y_mils + (template.layout[c.slot]?.[1] ?? 0),
    value: resolveValue(c.value, paramsUsed, template, c.slot),
  }));
  const nets: InstantiatedNet[] = template.nets.map((n) => ({
    name: n.name,
    pins: n.pins.map((p) => {
      const dot = p.indexOf(".");
      const slot = p.slice(0, dot);
      const pin = p.slice(dot + 1);
      return `${designators[slot]}.${pin}`;
    }),
    termination: n.termination ?? "none",
  }));
  return { template: template.name, origin, components, nets, params_used: paramsUsed };
}

// ---------------------------------------------------------------------------
// Anchor-pin placement math (pure)
// ---------------------------------------------------------------------------

/** Case-insensitive pin lookup by number within a fetched pin table. */
export function findTemplatePin(
  tables: Map<string, PinTableEntry>,
  libReference: string,
  pinNumber: string,
): PinTablePin | null {
  const entry = tables.get(libReference.trim().toLowerCase());
  if (!entry) return null;
  const hit = entry.pins.find((p) => p.number.toLowerCase() === pinNumber.trim().toLowerCase());
  return hit ?? null;
}

/**
 * Component ORIGIN that puts the given pin's HOTSPOT exactly on the target at
 * the given rotation: origin = target − rotate(rot0 hotspot offset, θ).
 * The rotation matrix is the empirically calibrated CCW convention (see
 * rotateOffsetCCW); callers should still read back the placed pin and nudge
 * via set_component_transform if it ever disagrees.
 */
export function anchoredOrigin(
  pin: PinTablePin,
  rotationDeg: number,
  target: { x: number; y: number },
): { x: number; y: number } {
  const o = pinHotspotOffsetAtRot0(pin);
  const r = rotateOffsetCCW(o.dx, o.dy, rotationDeg);
  return { x: target.x - r.dx, y: target.y - r.dy };
}

// ---------------------------------------------------------------------------
// Pre-flight symbol/pin validation (pure, against fetched pin tables)
// ---------------------------------------------------------------------------

export interface PreflightIssue {
  code: "SYMBOL_NOT_IN_LIBRARY" | "PIN_NOT_ON_SYMBOL";
  message: string;
}

/**
 * Validate every component's lib_reference and every net pin ref against the
 * real library pin tables BEFORE anything is placed — hallucinated symbol
 * names or wrong pin numbers fail with zero side effects.
 */
export function preflightModuleInstance(
  instance: ModuleInstance,
  template: ModuleTemplate,
  pinTables: Map<string, PinTableEntry>,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const slotByDesignator = new Map(instance.components.map((c) => [c.designator, c]));
  const slotTables = new Map<string, PinTableEntry>();
  for (const c of template.components) {
    const table = pinTables.get(c.lib_reference.toLowerCase());
    if (!table) {
      issues.push({
        code: "SYMBOL_NOT_IN_LIBRARY",
        message: `slot ${c.slot}: lib_reference "${c.lib_reference}" not found in the focused project's libraries`,
      });
      slotTables.set(c.slot, null as unknown as PinTableEntry);
      continue;
    }
    slotTables.set(c.slot, table);
  }
  for (const net of instance.nets) {
    for (const pinRef of net.pins) {
      const dot = pinRef.indexOf(".");
      const des = pinRef.slice(0, dot);
      const pinNo = pinRef.slice(dot + 1);
      const comp = slotByDesignator.get(des);
      if (!comp) continue; // planning bug — planModuleInstance guarantees this
      const table = slotTables.get(comp.slot);
      if (!table) continue; // already reported as SYMBOL_NOT_IN_LIBRARY
      if (!table.pins.some((p) => p.number === pinNo)) {
        issues.push({
          code: "PIN_NOT_ON_SYMBOL",
          message: `net "${net.name}": ${comp.slot} (${comp.lib_reference}) has no pin "${pinNo}" — available: ${table.pins.map((p) => p.number).join(", ")}`,
        });
      }
    }
  }
  return issues;
}

/** Fetch pin tables for the template's distinct lib_references (bridge). */
export async function fetchTemplatePinTables(
  bridge: AltiumBridge,
  template: ModuleTemplate,
): Promise<{ ok: true; tables: Map<string, PinTableEntry>; rawCount: number } | { ok: false; error: string }> {
  const fetched = await fetchLibraryComponents(bridge);
  if (!fetched.ok) return { ok: false, error: fetched.error };
  const wanted = [...new Set(template.components.map((c) => c.lib_reference))];
  const { matched } = buildPinTable(fetched.components as RawLibraryComponent[], wanted);
  return { ok: true, tables: new Map(matched.map((m) => [m.lib_reference.toLowerCase(), m])), rawCount: fetched.components.length };
}
