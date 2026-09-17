import * as z from "zod/v4";
import type { AltiumBridge } from "../bridge/altiumBridge.js";
import { type PinTableEntry, fetchLibraryComponents, buildPinTable } from "./pinTable.js";

/**
 * validate_netlist: machine validation of the GOLDEN NETLIST (stage-1
 * deliverable) BEFORE any component is placed or any wire drawn.
 *
 * The netlist is the single source of truth for the whole drawing pipeline
 * (plan_placement -> wire_pins -> check_connectivity all compare against it),
 * so errors made here propagate through everything downstream. This tool
 * catches the classic LLM netlist failures at zero cost:
 *   - hallucinated pins ("U1.14" on a part that has 12 pins)
 *   - a pin assigned to two nets (short by construction)
 *   - forgotten pins / forgotten components (incomplete coverage)
 *   - power pins left on signal nets
 *
 * Two modes:
 *   - pin-tables (preferred): fetches real pin definitions from the focused
 *     project's libraries (pin_table data path) and validates against them
 *   - syntax-only (fallback, when libraries are unavailable): structural
 *     checks only — pin format, declared components, duplicate membership
 */

export const validateNetlistInputSchema = z.object({
  components: z
    .array(
      z.object({
        designator: z.string().min(1).describe("Reference designator, e.g. R1, U1, J1."),
        lib_reference: z.string().min(1).describe("Library symbol name, e.g. Res1, LED0, STM32F103C8."),
      }),
    )
    .min(1)
    .describe("BOM: every component the schematic will place."),
  nets: z
    .array(
      z.object({
        name: z.string().min(1).describe("Net name, e.g. VCC, GND, LED1, SDA. Uppercase letters/digits/underscore."),
        pins: z.array(z.string().min(1)).min(1).describe('Net members as "DESIGNATOR.PIN", e.g. ["R1.2", "D1.1"].'),
      }),
    )
    .min(1)
    .describe("The netlist: every net with its full pin member list."),
  check_pin_tables: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Validate against real library pin definitions (focused project's .SchLib files). " +
        "false = syntax-only validation without touching Altium.",
    ),
});

export type ValidateNetlistInput = z.infer<typeof validateNetlistInputSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetlistIssue {
  code: string;
  message: string;
}

export interface NetlistReport {
  ok: boolean;
  mode: "pin-tables" | "syntax-only";
  errors: NetlistIssue[];
  warnings: NetlistIssue[];
  pin_coverage: {
    components: number;
    distinct_pins: number;
    assigned_pins: number;
    unassigned_by_component: Array<{ designator: string; lib_reference: string; unassigned_pins: string[] }>;
  };
  power_nets: string[];
  nets: Array<{ name: string; pins: string[]; is_power: boolean }>;
  frozen_netlist: { components: Array<{ designator: string; lib_reference: string }>; nets: Array<{ name: string; pins: string[] }> };
  notes: string[];
}

// Heuristic power-net names (uppercase compare). Extend as libraries grow.
const POWER_NET_PATTERN = /^(VCC|VDD|VEE|VSS|GND|AGND|DGND|\+?[0-9]+V[0-9]*|VBAT|VBUS|AVDD|AVSS|DVDD|DVSS)(_.*)?$/i;

const POWER_PIN_TYPES = new Set(["eelectricpower"]);

// ---------------------------------------------------------------------------
// Pure validator (testable without Altium)
// ---------------------------------------------------------------------------

export function validateNetlist(
  input: { components: Array<{ designator: string; lib_reference: string }>; nets: Array<{ name: string; pins: string[] }> },
  pinTables?: Map<string, PinTableEntry>,
): NetlistReport {
  const errors: NetlistIssue[] = [];
  const warnings: NetlistIssue[] = [];
  const notes: string[] = [];
  const mode: NetlistReport["mode"] = pinTables && pinTables.size > 0 ? "pin-tables" : "syntax-only";

  // --- normalize + dedupe checks ------------------------------------------
  const byDes = new Map<string, { designator: string; lib_reference: string }>();
  for (const c of input.components) {
    const des = c.designator.trim().toUpperCase();
    if (byDes.has(des)) {
      errors.push({ code: "DUPLICATE_DESIGNATOR", message: `component designator "${des}" declared more than once` });
      continue;
    }
    byDes.set(des, { designator: des, lib_reference: c.lib_reference.trim() });
  }

  const netByName = new Map<string, { name: string; pins: string[] }>();
  for (const n of input.nets) {
    const name = n.name.trim();
    if (netByName.has(name)) {
      errors.push({ code: "DUPLICATE_NET_NAME", message: `net "${name}" declared more than once` });
      continue;
    }
    netByName.set(name, { name, pins: n.pins.map((p) => p.trim()) });
  }

  // --- per-pin membership ---------------------------------------------------
  // pinKey (DES.PIN, uppercase designator) -> net name(s)
  const pinOwners = new Map<string, Set<string>>();
  const pinParseFail = new Set<string>();
  for (const [netName, net] of netByName) {
    const seenInNet = new Set<string>();
    for (const raw of net.pins) {
      const dot = raw.indexOf(".");
      if (dot <= 0 || dot === raw.length - 1) {
        pinParseFail.add(raw);
        continue;
      }
      const des = raw.slice(0, dot).trim().toUpperCase();
      const pin = raw.slice(dot + 1).trim();
      const key = `${des}.${pin}`;
      if (seenInNet.has(key)) {
        errors.push({ code: "DUPLICATE_PIN_IN_NET", message: `pin ${key} listed twice in net "${netName}"` });
        continue;
      }
      seenInNet.add(key);
      if (!byDes.has(des)) {
        errors.push({ code: "PIN_ON_UNDECLARED_COMPONENT", message: `pin ${key} (net "${netName}") references a designator not in components[]` });
        continue;
      }
      const owners = pinOwners.get(key) ?? new Set<string>();
      owners.add(netName);
      pinOwners.set(key, owners);
    }
  }
  for (const raw of pinParseFail) {
    errors.push({ code: "PIN_MALFORMED", message: `"${raw}" is not in DESIGNATOR.PIN form (e.g. R1.2)` });
  }
  for (const [key, owners] of pinOwners) {
    if (owners.size > 1) {
      errors.push({
        code: "PIN_IN_MULTIPLE_NETS",
        message: `pin ${key} belongs to nets [${[...owners].join(", ")}] — one pin can only be on one net (this is a short by construction)`,
      });
    }
  }

  // --- net shape -------------------------------------------------------------
  const powerNets: string[] = [];
  const netSummaries: NetlistReport["nets"] = [];
  for (const [name, net] of netByName) {
    const validPins = net.pins.filter((p) => p.indexOf(".") > 0);
    if (validPins.length === 0) {
      errors.push({ code: "EMPTY_NET", message: `net "${name}" has no valid pins` });
    } else if (validPins.length === 1) {
      warnings.push({ code: "SINGLE_PIN_NET", message: `net "${name}" has a single pin (${validPins[0]}) — dangling unless more members are planned` });
    }
    const isPower = POWER_NET_PATTERN.test(name);
    if (isPower) powerNets.push(name);
    netSummaries.push({ name, pins: validPins, is_power: isPower });
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      warnings.push({ code: "NET_NAME_CONVENTION", message: `net name "${name}" deviates from LettersDigitsUnderscore convention` });
    }
  }

  // --- pin-table mode --------------------------------------------------------
  let distinctPins = pinOwners.size;
  let assignedPins = pinOwners.size;
  const unassignedByComponent: NetlistReport["pin_coverage"]["unassigned_by_component"] = [];

  if (mode === "pin-tables") {
    const powerNetSet = new Set(powerNets.map((n) => n.toUpperCase()));
    const pinNetOf = new Map<string, string>();
    for (const [key, owners] of pinOwners) pinNetOf.set(key, [...owners][0]);

    distinctPins = 0;
    assignedPins = 0;
    for (const [des, comp] of byDes) {
      const table = pinTables!.get(comp.lib_reference.toLowerCase());
      if (!table) {
        warnings.push({
          code: "NO_PIN_TABLE",
          message: `lib_reference "${comp.lib_reference}" (${des}) not found in the focused project's libraries — its pins could not be verified`,
        });
        continue;
      }
      // Iterate pins deduped by number (multi-part symbols list a number twice).
      const pinsByNumber = new Map<string, PinTableEntry["pins"][number]>();
      for (const p of table.pins) {
        if (!pinsByNumber.has(p.number)) pinsByNumber.set(p.number, p);
      }
      distinctPins += pinsByNumber.size;
      const unassigned: string[] = [];
      for (const [num, p] of pinsByNumber) {
        const key = `${des}.${num}`;
        if (pinNetOf.has(key)) {
          assignedPins += 1;
          // Power pin on a non-power net?
          if (POWER_PIN_TYPES.has(p.electrical_type.toLowerCase()) && !powerNetSet.has((pinNetOf.get(key) ?? "").toUpperCase())) {
            warnings.push({
              code: "POWER_PIN_OFF_POWER_NET",
              message: `${des}.${num} ("${p.name}", electrical type ${p.electrical_type}) is assigned to net "${pinNetOf.get(key)}" which does not look like a power net — power pins belong on VCC/GND-style nets`,
            });
          }
        } else {
          unassigned.push(num);
        }
      }
      if (table.also_in_libraries.length > 0) {
        notes.push(
          `"${comp.lib_reference}" also exists in: ${table.also_in_libraries.join(", ")} — ` +
          `pin geometry was taken from ${table.library_name}; pass the exact library when placing to avoid a different symbol being used`,
        );
      }
      if (unassigned.length > 0) {
        unassignedByComponent.push({ designator: des, lib_reference: comp.lib_reference, unassigned_pins: unassigned });
      }
    }

    // Hallucinated pins: referenced but absent from the component's table.
    for (const [key] of pinOwners) {
      const des = key.slice(0, key.indexOf("."));
      const pinNo = key.slice(key.indexOf(".") + 1);
      const comp = byDes.get(des);
      if (!comp) continue; // already reported as undeclared
      const table = pinTables!.get(comp.lib_reference.toLowerCase());
      if (!table) continue; // already warned
      if (!table.pins.some((p) => p.number === pinNo)) {
        errors.push({
          code: "PIN_NOT_ON_COMPONENT",
          message: `${key}: "${comp.lib_reference}" has no pin ${pinNo} (available: ${table.pins.map((p) => p.number).join(", ")}) — hallucinated or mistyped pin`,
        });
      }
    }

    // Power nets with zero power-type pins (suspicious but not fatal).
    for (const pn of powerNets) {
      const hasPowerPin = [...pinNetOf.entries()].some(([key, net]) => {
        if (net !== pn) return false;
        const des = key.slice(0, key.indexOf("."));
        const pinNo = key.slice(key.indexOf(".") + 1);
        const comp = byDes.get(des);
        const table = comp && pinTables!.get(comp.lib_reference.toLowerCase());
        return table?.pins.some((p) => p.number === pinNo && POWER_PIN_TYPES.has(p.electrical_type.toLowerCase())) === true;
      });
      if (!hasPowerPin) {
        warnings.push({
          code: "POWER_NET_NO_POWER_PIN",
          message: `power net "${pn}" carries no eElectricPower pin — fine for passive rails (VCC through resistors) but double-check the intent`,
        });
      }
    }

    if (unassignedByComponent.length > 0) {
      notes.push(
        "unassigned pins are not errors (unused/NC pins exist) — but every unassigned pin will float on the sheet; " +
          "plan a no-ERC marker or an explicit NC note for them, and re-check any component with ZERO assigned pins " +
          "(typically a component placed in the BOM but forgotten in the netlist).",
      );
    }
  } else {
    notes.push("syntax-only mode: pin existence/coverage not verified (no library pin tables). Pass check_pin_tables=true with the project focused for full validation.");
  }

  return {
    ok: errors.length === 0,
    mode,
    errors,
    warnings,
    pin_coverage: {
      components: byDes.size,
      distinct_pins: distinctPins,
      assigned_pins: assignedPins,
      unassigned_by_component: unassignedByComponent,
    },
    power_nets: powerNets,
    nets: netSummaries,
    frozen_netlist: {
      components: [...byDes.values()],
      nets: [...netByName.values()],
    },
    notes,
  };
}

// ---------------------------------------------------------------------------
// Bridge execution
// ---------------------------------------------------------------------------

export async function runValidateNetlist(
  bridge: AltiumBridge,
  input: ValidateNetlistInput,
): Promise<Record<string, unknown>> {
  let pinTables: Map<string, PinTableEntry> | undefined;

  if (input.check_pin_tables) {
    const fetched = await fetchLibraryComponents(bridge);
    if (fetched.ok) {
      const wanted = [...new Set(input.components.map((c) => c.lib_reference))];
      const { matched } = buildPinTable(fetched.components, wanted);
      pinTables = new Map(matched.map((m) => [m.lib_reference.toLowerCase(), m]));
    }
    // Library unavailable -> syntax-only below; validateNetlist handles it.
  }

  const report = validateNetlist(input, pinTables);
  const result: Record<string, unknown> = { ...report };
  if (input.check_pin_tables && report.mode === "syntax-only") {
    result.library_note =
      "pin-table validation was requested but no library components matched — fell back to syntax-only. " +
      "Focus the project that owns the .SchLib files and retry for full validation.";
  }
  if (report.ok) {
    result.next_step =
      "netlist is valid — freeze it as the golden baseline for the drawing pipeline: place components " +
      "(plan coarsely, functional blocks >=100 mil apart), then wire each net with wire_pins(net_name, pins=[...]), " +
      "then check_connectivity and compare the partition against this netlist.";
  }
  return result;
}
