import * as z from "zod/v4";
import type { AltiumBridge } from "../bridge/altiumBridge.js";

/**
 * pin_table: pin definitions for library symbols BEFORE any placement — the
 * planning-time input for netlist design (stage 1 of the drawing pipeline).
 *
 * Data path: bridge command get_library_symbol_reference enumerates the
 * focused project's .SchLib files and returns every component with its pins
 * (number, name, electrical type, orientation, location, length). This tool
 * filters that to the requested lib_references and derives each pin's
 * FREE-END hotspot offset (Location + PinLength along orientation — the same
 * math SchEditGetComponentInfo uses on placed parts), so the model can plan
 * connections and rotations against real pin geometry without placing first.
 */

export const pinTableInputSchema = z.object({
  lib_references: z
    .array(z.string().min(1))
    .min(1)
    .max(40)
    .describe(
      "Symbol names to look up, e.g. [\"Res1\", \"Cap\", \"LED0\", \"SW-PB\", \"Header 2\"]. " +
        "Case-insensitive; matched against the focused project's .SchLib files.",
    ),
});

export type PinTableInput = z.infer<typeof pinTableInputSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PinTablePin {
  /** Pin number/designator — the "PIN" part of "DES.PIN" references. */
  number: string;
  name: string;
  /** eElectricInput / eElectricOutput / eElectricIO / eElectricPower / eElectricPassive / ... */
  electrical_type: string;
  /** 0 / 90 / 180 / 270 — direction the pin extends OUT from the symbol body (CCW, Y-up). */
  orientation_deg: number;
  /** Pin location in library coordinates (mils, body-side end). */
  x: number;
  y: number;
  pin_length_mils: number;
  /** For multi-part symbols: which part owns this pin (1-based). */
  owner_part_id: number;
  /** Free-end hotspot offset from (x, y) along orientation — where a wire must land. */
  hotspot_dx: number;
  hotspot_dy: number;
}

export interface PinTableEntry {
  lib_reference: string;
  description: string;
  default_designator: string;
  part_count: number;
  library_name: string;
  pins: PinTablePin[];
  /** Other libraries that also define this lib_reference (first-wins pick). */
  also_in_libraries: string[];
}

/** Raw component row as returned by the bridge (get_library_symbol_reference). */
export interface RawLibraryComponent {
  lib_reference?: string;
  description?: string;
  designator?: string;
  part_count?: number;
  library_name?: string;
  pins?: Array<{
    pin_number?: string;
    pin_name?: string;
    pin_type?: string;
    pin_orientation?: string;
    x?: number;
    y?: number;
    pin_length_mils?: number;
    owner_part_id?: number;
  }>;
}

const ORIENT_TO_DEG: Record<string, number> = {
  erotate0: 0,
  erotate90: 90,
  erotate180: 180,
  erotate270: 270,
};

function hotspotOffset(orientationDeg: number, lengthMils: number): { dx: number; dy: number } {
  switch (((Math.round(orientationDeg / 90) % 4) + 4) % 4) {
    case 0:
      return { dx: lengthMils, dy: 0 };
    case 1:
      return { dx: 0, dy: lengthMils };
    case 2:
      return { dx: -lengthMils, dy: 0 };
    default:
      return { dx: 0, dy: -lengthMils };
  }
}

// ---------------------------------------------------------------------------
// Pure matching/derivation (testable without Altium)
// ---------------------------------------------------------------------------

/**
 * CCW rotation of a symbol-local offset (AD convention, Y-up). Empirically
 * calibrated on AD22 against PLACED components: Res1 rot90/rot270, Header 2
 * rot0/rot180, Cap rot270, Diode rot0 all reproduce measured pin hotspots.
 */
export function rotateOffsetCCW(dx: number, dy: number, rotationDeg: number): { dx: number; dy: number } {
  switch (((Math.round(rotationDeg / 90) % 4) + 4) % 4) {
    case 0:
      return { dx, dy };
    case 1:
      return { dx: -dy, dy: dx };
    case 2:
      return { dx: -dx, dy: -dy };
    default:
      return { dx: dy, dy: -dx };
  }
}

/** rot0 hotspot offset (mils) of a pin FROM THE COMPONENT ORIGIN, from
 *  library pin data: pin location + free-end extension along its orientation. */
export function pinHotspotOffsetAtRot0(pin: PinTablePin): { dx: number; dy: number } {
  return { dx: pin.x + pin.hotspot_dx, dy: pin.y + pin.hotspot_dy };
}

export function buildPinTable(
  rawComponents: RawLibraryComponent[],
  wanted: string[],
): { matched: PinTableEntry[]; unmatched: string[] } {
  // Group by lowercase lib_reference — several libraries may define the same
  // symbol name with DIFFERENT geometry (e.g. "Cap" in two libs, one vertical
  // one horizontal). First wins, the rest are reported for disambiguation.
  const byLower = new Map<string, RawLibraryComponent[]>();
  for (const c of rawComponents) {
    if (!c?.lib_reference) continue;
    const k = String(c.lib_reference).trim().toLowerCase();
    const list = byLower.get(k) ?? [];
    list.push(c);
    byLower.set(k, list);
  }

  const matched: PinTableEntry[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const ref of wanted) {
    const key = ref.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const raws = byLower.get(key);
    if (!raws || raws.length === 0) {
      unmatched.push(ref);
      continue;
    }
    const raw = raws[0];
    // Dedupe pins by number (multi-part / duplicated rows list a number twice).
    const pinsByNumber = new Map<string, PinTablePin>();
    for (const p of raw.pins ?? []) {
      if (typeof p.pin_number !== "string" || p.pin_number === "") continue;
      if (pinsByNumber.has(p.pin_number)) continue;
      const orientationDeg = ORIENT_TO_DEG[String(p.pin_orientation ?? "").toLowerCase()] ?? 0;
      const length = typeof p.pin_length_mils === "number" ? p.pin_length_mils : 0;
      const { dx, dy } = hotspotOffset(orientationDeg, length);
      pinsByNumber.set(p.pin_number, {
        number: String(p.pin_number),
        name: String(p.pin_name ?? ""),
        electrical_type: String(p.pin_type ?? "eElectricPassive"),
        orientation_deg: orientationDeg,
        x: typeof p.x === "number" ? p.x : 0,
        y: typeof p.y === "number" ? p.y : 0,
        pin_length_mils: length,
        owner_part_id: typeof p.owner_part_id === "number" ? p.owner_part_id : 1,
        hotspot_dx: dx,
        hotspot_dy: dy,
      });
    }
    matched.push({
      lib_reference: String(raw.lib_reference),
      description: String(raw.description ?? ""),
      default_designator: String(raw.designator ?? ""),
      part_count: typeof raw.part_count === "number" ? raw.part_count : 1,
      library_name: String(raw.library_name ?? ""),
      pins: [...pinsByNumber.values()],
      also_in_libraries: raws.slice(1).map((r) => String(r.library_name ?? "")),
    });
  }
  return { matched, unmatched };
}

// ---------------------------------------------------------------------------
// Bridge execution
// ---------------------------------------------------------------------------

export async function fetchLibraryComponents(
  bridge: AltiumBridge,
): Promise<{ ok: true; components: RawLibraryComponent[] } | { ok: false; error: string }> {
  const res = await bridge.executeCommand("get_library_symbol_reference", {}, { timeoutMs: 240_000 });
  if (!res.success) {
    return { ok: false, error: String(res.error ?? "bridge error") };
  }
  const r = (res.result ?? {}) as { components?: RawLibraryComponent[] };
  return { ok: true, components: r.components ?? [] };
}

export async function runPinTable(
  bridge: AltiumBridge,
  input: PinTableInput,
): Promise<Record<string, unknown>> {
  const fetched = await fetchLibraryComponents(bridge);
  if (!fetched.ok) {
    return {
      ok: false,
      error:
        `library enumeration failed: ${fetched.error}. ` +
        `pin_table searches the FOCUSED project's .SchLib files — open/focus the project that owns the libraries and retry.`,
    };
  }
  const { matched, unmatched } = buildPinTable(fetched.components, input.lib_references);
  if (matched.length === 0) {
    return {
      ok: false,
      error:
        `none of [${input.lib_references.join(", ")}] found in the focused project's libraries. ` +
        `Enumerated ${fetched.components.length} components — call get_library_symbol_reference to list them, ` +
        `or check the symbol name spelling.`,
      library_component_count: fetched.components.length,
    };
  }
  const result: Record<string, unknown> = {
    ok: true,
    matched_count: matched.length,
    components: matched,
  };
  if (unmatched.length > 0) {
    result.unmatched = unmatched;
    result.unmatched_hint =
      "not found in the focused project's libraries — verify the lib_reference (search_library_symbol) " +
      "or place one instance and read pins back with edit_schematic get_component_info";
  }
  result.note =
    "hotspot_dx/dy give each pin's FREE-END offset from its (x, y) along orientation_deg — " +
    "a wire must land on the hotspot, not the body-side location. Orientation is per-symbol; " +
    "do not assume 2-pin symbols are horizontal — check orientation_deg before planning rotations.";
  return result;
}
