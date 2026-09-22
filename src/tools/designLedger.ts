import * as z from "zod/v4";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { validateNetlist } from "./validateNetlist.js";

/**
 * design_ledger: the EXTERNAL design state — the cure for "context loses
 * constraints" in long sessions.
 *
 * The ledger persists the authoritative artifacts of a drawing pipeline on
 * disk (frozen netlist, placement table with facing rationales, rail map,
 * progress, open issues) keyed by the schematic it belongs to. Discipline:
 * LOAD before starting/resuming any stage, SAVE after every stage. The
 * ledger adds REVIEW on both ends:
 *   - save: structural lint of the netlist (syntax-level, pure) + discipline
 *     warnings (placement entries without a facing rationale)
 *   - load/status: a review digest — pending placements, pending nets,
 *     stale progress, stage contradictions — so nothing is silently forgotten.
 *
 * Pure Node (no bridge): fully unit-testable, works while AD is closed.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ledgerStateSchema = z.object({
  design_name: z.string().min(1).describe("Human name of the design, e.g. 'buck-power-stage-v1'."),
  description: z.string().optional().describe("One-line purpose of this design."),
  stage: z
    .enum(["planning", "selection", "placement", "wiring", "verified", "archived"])
    .optional()
    .describe("Pipeline stage this state was saved at."),
  block_map: z
    .array(
      z.object({
        name: z.string(),
        function: z.string().optional(),
        inputs: z.array(z.string()).optional(),
        outputs: z.array(z.string()).optional(),
        components: z.array(z.string()).optional(),
      }),
    )
    .optional()
    .describe("STAGE 0 artifact: functional blocks with their left/right interfaces."),
  rail_map: z
    .array(
      z.object({
        net_name: z.string(),
        y_mils: z.number(),
        pins: z.array(z.string()),
      }),
    )
    .optional()
    .describe("STAGE 0 artifact: horizontal rails — net, y coordinate, pins landing on the rail."),
  placement: z
    .array(
      z.object({
        designator: z.string(),
        lib_reference: z.string(),
        anchor_pin: z.string().optional().describe("Pin whose hotspot lands on x/y (preferred semantics)."),
        x_mils: z.number(),
        y_mils: z.number(),
        rotation_deg: z.number(),
        why: z.string().optional().describe("Facing rationale — WHY this rotation (KB 02 discipline)."),
      }),
    )
    .optional()
    .describe("Placement table: pin-target semantics; one entry per component."),
  netlist: z
    .object({
      components: z.array(z.object({ designator: z.string(), lib_reference: z.string() })).min(1),
      nets: z.array(z.object({ name: z.string(), pins: z.array(z.string()).min(1) })).min(1),
      no_connect: z.array(z.string()).optional(),
    })
    .optional()
    .describe("The FROZEN netlist (validate_netlist output) — single source of truth."),
  labels: z
    .array(z.object({ net: z.string(), x_mils: z.number(), y_mils: z.number() }))
    .optional()
    .describe("Net-label anchors (collision-checked slots from the STAGE-0 spacing budget)."),
  ports: z
    .array(z.object({ net: z.string(), pin: z.string(), style: z.enum(["gnd", "vcc"]) }))
    .optional()
    .describe("Power-port terminations: net + the pin hotspot it hangs on + style."),
  progress: z
    .object({
      components_placed: z.array(z.string()).optional(),
      nets_wired: z.array(z.string()).optional(),
      verification: z.record(z.string(), z.unknown()).optional(),
    })
    .optional()
    .describe("What has actually landed on the sheet so far."),
  open_issues: z.array(z.string()).optional().describe("Known unresolved issues (constraints to keep visible)."),
});

export type LedgerState = z.infer<typeof ledgerStateSchema>;

export const designLedgerInputSchema = z.object({
  action: z.enum(["save", "load", "status", "list", "delete"]),
  schematic_full_path: z
    .string()
    .optional()
    .describe("Ledger key: the schematic this design belongs to (required for save/load/status/delete)."),
  state: ledgerStateSchema.optional().describe("The design state to persist (required for save)."),
  note: z.string().optional().describe("History entry annotation for save (e.g. 'nets VIN/GND wired')."),
});

export type DesignLedgerInput = z.infer<typeof designLedgerInputSchema>;

// ---------------------------------------------------------------------------
// File layout
// ---------------------------------------------------------------------------

const HISTORY_CAP = 50;

export function defaultLedgerDir(): string {
  return join(homedir(), ".altium-mcp", "ledgers");
}

export function keyFor(schematicFullPath: string): string {
  // Flatten the path into a filename-safe key + short hash suffix against collisions.
  const flat = schematicFullPath.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  let h = 0;
  for (let i = 0; i < schematicFullPath.length; i++) {
    h = (h * 31 + schematicFullPath.charCodeAt(i)) | 0;
  }
  return `${flat.slice(-80)}_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function ledgerPath(ledgerDir: string, schematicFullPath: string): string {
  return join(ledgerDir, `${keyFor(schematicFullPath)}.json`);
}

export interface LedgerFile {
  version: 1;
  schematic_full_path: string;
  created_at: string;
  updated_at: string;
  state: LedgerState;
  history: Array<{ at: string; note: string }>;
}

// ---------------------------------------------------------------------------
// Review digest (pure)
// ---------------------------------------------------------------------------

export interface LedgerReview {
  stage: string;
  updated_at: string;
  netlist: { components: number; nets: number; no_connect: number; syntax_errors: Array<{ code: string; message: string }> } | null;
  pending_placed: string[];
  pending_nets: string[];
  stale_progress: { wired_not_in_netlist: string[]; placed_not_in_netlist: string[] };
  warnings: string[];
}

export function reviewLedger(file: LedgerFile): LedgerReview {
  const s = file.state;
  const warnings: string[] = [];
  const netComponents = new Set((s.netlist?.components ?? []).map((c) => c.designator.trim().toUpperCase()));
  const netNets = new Set((s.netlist?.nets ?? []).map((n) => n.name));

  // pending placements: netlist components not yet marked placed
  const placed = new Set((s.progress?.components_placed ?? []).map((p) => p.trim().toUpperCase()));
  const pendingPlaced = [...netComponents].filter((d) => !placed.has(d)).sort();

  // pending nets: netlist nets not yet wired
  const wired = new Set(s.progress?.nets_wired ?? []);
  const pendingNets = [...netNets].filter((n) => !wired.has(n)).sort();

  // stale progress
  const wiredNotInNetlist = [...wired].filter((n) => !netNets.has(n)).sort();
  const placedNotInNetlist = [...placed].filter((d) => !netComponents.has(d)).sort();

  // netlist syntax lint (pure — no bridge, no pin tables)
  let syntax: LedgerReview["netlist"] = null;
  if (s.netlist) {
    const lint = validateNetlist(
      { components: s.netlist.components, nets: s.netlist.nets, no_connect: s.netlist.no_connect },
      undefined,
    );
    syntax = {
      components: s.netlist.components.length,
      nets: s.netlist.nets.length,
      no_connect: s.netlist.no_connect?.length ?? 0,
      syntax_errors: lint.errors.map((e) => ({ code: e.code, message: e.message })),
    };
    if (lint.errors.length > 0) warnings.push("netlist has STRUCTURAL errors — fix before relying on it (see netlist.syntax_errors)");
  } else {
    warnings.push("no frozen netlist in the ledger — stage-1 baseline is missing; run validate_netlist and save");
  }

  // stage contradictions
  const stage = s.stage ?? "(unset)";
  if ((stage === "wiring" || stage === "verified") && pendingPlaced.length > 0) {
    warnings.push(`stage=${stage} but ${pendingPlaced.length} netlist component(s) not marked placed: ${pendingPlaced.join(", ")}`);
  }
  if (stage === "verified" && pendingNets.length > 0) {
    warnings.push(`stage=verified but ${pendingNets.length} net(s) not marked wired: ${pendingNets.join(", ")}`);
  }
  if (wiredNotInNetlist.length > 0) {
    warnings.push(`progress wires net(s) absent from the netlist (stale or typo): ${wiredNotInNetlist.join(", ")}`);
  }
  if (placedNotInNetlist.length > 0) {
    warnings.push(`progress places component(s) absent from the netlist (stale or typo): ${placedNotInNetlist.join(", ")}`);
  }

  // placement discipline: every entry needs a facing rationale (KB 02)
  const rationaleless = (s.placement ?? []).filter((p) => !p.why || p.why.trim() === "");
  if (rationaleless.length > 0) {
    warnings.push(
      `placement entries without a facing rationale (why): ${rationaleless.map((p) => p.designator).join(", ")} — every rotation needs a reason`,
    );
  }
  const anchored = (s.placement ?? []).filter((p) => p.anchor_pin).length;
  if (s.placement && s.placement.length > 0 && anchored === 0) {
    warnings.push("no placement entry uses anchor_pin — origin-based placement re-introduces AD rotation swing (KB 06 §1)");
  }

  // plan/netlist cross-checks
  const placementDes = new Set((s.placement ?? []).map((p) => p.designator.trim().toUpperCase()));
  const netWithoutPlacement = [...netComponents].filter((d) => !placementDes.has(d));
  if (s.placement && s.placement.length > 0 && netWithoutPlacement.length > 0) {
    warnings.push(`netlist component(s) missing from the placement table: ${netWithoutPlacement.join(", ")}`);
  }
  if ((s.open_issues ?? []).length > 0) {
    warnings.push(`${s.open_issues!.length} open issue(s): ${s.open_issues!.join(" | ")}`);
  }

  return {
    stage,
    updated_at: file.updated_at,
    netlist: syntax,
    pending_placed: pendingPlaced,
    pending_nets: pendingNets,
    stale_progress: { wired_not_in_netlist: wiredNotInNetlist, placed_not_in_netlist: placedNotInNetlist },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function runDesignLedger(
  input: DesignLedgerInput,
  ledgerDir: string = defaultLedgerDir(),
): Record<string, unknown> {
  const now = new Date().toISOString();

  if (input.action === "list") {
    if (!existsSync(ledgerDir)) return { ok: true, action: "list", ledgers: [] };
    const out: Array<Record<string, unknown>> = [];
    for (const f of readdirSync(ledgerDir).filter((f) => f.endsWith(".json")).sort()) {
      try {
        const file = JSON.parse(readFileSync(join(ledgerDir, f), "utf8")) as LedgerFile;
        out.push({
          schematic_full_path: file.schematic_full_path,
          design_name: file.state.design_name,
          stage: file.state.stage ?? "(unset)",
          updated_at: file.updated_at,
        });
      } catch {
        out.push({ file: f, error: "corrupt ledger file (unparsable JSON)" });
      }
    }
    return { ok: true, action: "list", ledgers: out };
  }

  if (!input.schematic_full_path) {
    return { ok: false, error: "schematic_full_path is required for save/load/status/delete (it is the ledger key)" };
  }
  const path = ledgerPath(ledgerDir, input.schematic_full_path);

  if (input.action === "delete") {
    if (!existsSync(path)) return { ok: false, error: "no ledger for this schematic" };
    rmSync(path);
    return { ok: true, action: "delete", deleted: input.schematic_full_path };
  }

  if (input.action === "save") {
    if (!input.state) return { ok: false, error: "state is required for save" };
    let prev: LedgerFile | null = null;
    if (existsSync(path)) {
      try {
        prev = JSON.parse(readFileSync(path, "utf8")) as LedgerFile;
      } catch {
        prev = null; // overwrite corrupt files
      }
    }
    const history = [
      ...(prev?.history ?? []),
      ...(prev ? [{ at: prev.updated_at, note: `stage: ${prev.state.stage ?? "(unset)"}` }] : []),
      { at: now, note: input.note ?? `stage: ${input.state.stage ?? "(unset)"}` },
    ].slice(-HISTORY_CAP);
    const file: LedgerFile = {
      version: 1,
      schematic_full_path: input.schematic_full_path,
      created_at: prev?.created_at ?? now,
      updated_at: now,
      state: input.state,
      history,
    };
    mkdirSync(ledgerDir, { recursive: true });
    writeFileSync(path, JSON.stringify(file, null, 1), "utf8");
    return {
      ok: true,
      action: "save",
      design_name: file.state.design_name,
      updated_at: now,
      review: reviewLedger(file),
      note: "saved — RE-READ the full state via load before the next stage; treat the review warnings as gates",
    };
  }

  // load / status
  if (!existsSync(path)) {
    return { ok: false, error: `no ledger for this schematic (${input.schematic_full_path}) — save one first` };
  }
  let file: LedgerFile;
  try {
    file = JSON.parse(readFileSync(path, "utf8")) as LedgerFile;
  } catch (e) {
    return { ok: false, error: `ledger file is corrupt: ${(e as Error).message}` };
  }
  const review = reviewLedger(file);
  if (input.action === "status") {
    return { ok: true, action: "status", design_name: file.state.design_name, review };
  }
  return {
    ok: true,
    action: "load",
    design_name: file.state.design_name,
    schematic_full_path: file.schematic_full_path,
    created_at: file.created_at,
    updated_at: file.updated_at,
    history: file.history,
    state: file.state,
    review,
    note: "state re-loaded from disk — use THESE values (netlist/placement/rails), not conversation memory; resolve review warnings before proceeding",
  };
}
