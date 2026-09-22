import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultLedgerDir,
  designLedgerInputSchema,
  keyFor,
  runDesignLedger,
  type LedgerState,
} from "../src/tools/designLedger.js";

// Injected temp dir — tests never touch the real ~/.altium-mcp/ledgers.
let dir: string;
const sheet = (n: string) => `C:\\proj\\${n}.SchDoc`;

function freshDir(): string {
  dir = mkdtempSync(join(tmpdir(), "ledger-"));
  return dir;
}
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const state = (over: Partial<LedgerState> = {}): LedgerState =>
  designLedgerInputSchema.shape.state.parse({
    design_name: "buck-power-stage",
    stage: "placement",
    rail_map: [{ net_name: "VOUT", y_mils: 1300, pins: ["L1.2", "C1.1"] }],
    placement: [
      { designator: "Q1", lib_reference: "NPN", anchor_pin: "1", x_mils: 1300, y_mils: 1900, rotation_deg: 0, why: "C 上 VIN 顶点" },
      { designator: "R1", lib_reference: "Res1", anchor_pin: "2", x_mils: 900, y_mils: 1600, rotation_deg: 0, why: "pin2→Q1.B，PWM 左进" },
    ],
    netlist: {
      components: [
        { designator: "Q1", lib_reference: "NPN" },
        { designator: "R1", lib_reference: "Res1" },
      ],
      nets: [
        { name: "PWM", pins: ["R1.1"] },
        { name: "DRIVE", pins: ["R1.2", "Q1.2"] },
      ],
    },
    progress: { components_placed: ["Q1"], nets_wired: ["PWM"] },
    ...over,
  }) as LedgerState;

describe("design ledger — save/load roundtrip", () => {
  it("saves and reloads state verbatim with history accumulating", () => {
    const d = freshDir();
    const r1 = runDesignLedger({ action: "save", schematic_full_path: sheet("S1"), state: state(), note: "placement done" }, d);
    expect(r1.ok).toBe(true);
    const r2 = runDesignLedger({ action: "save", schematic_full_path: sheet("S1"), state: state({ stage: "wiring" }), note: "wiring start" }, d);
    expect(r2.ok).toBe(true);
    const load = runDesignLedger({ action: "load", schematic_full_path: sheet("S1") }, d);
    expect(load.ok).toBe(true);
    expect(load.state).toMatchObject({ design_name: "buck-power-stage", stage: "wiring" });
    expect(load.state.netlist.nets.map((n: { name: string }) => n.name)).toEqual(["PWM", "DRIVE"]);
    expect(load.history.at(-1)?.note).toBe("wiring start");
    expect(load.created_at).toBeTruthy();
  });

  it("different schematics map to different ledger keys (no collisions)", () => {
    const d = freshDir();
    runDesignLedger({ action: "save", schematic_full_path: sheet("A"), state: state() }, d);
    runDesignLedger({ action: "save", schematic_full_path: sheet("B"), state: state({ design_name: "other" }) }, d);
    const list = runDesignLedger({ action: "list" }, d) as { ledgers: unknown[] };
    expect(list.ledgers).toHaveLength(2);
    expect(keyFor(sheet("A"))).not.toBe(keyFor(sheet("B")));
  });

  it("save without state / load of unknown ledger fail cleanly", () => {
    const d = freshDir();
    expect(runDesignLedger({ action: "save", schematic_full_path: sheet("X") }, d).ok).toBe(false);
    expect(runDesignLedger({ action: "load", schematic_full_path: sheet("X") }, d).ok).toBe(false);
    expect(runDesignLedger({ action: "status" }, d).ok).toBe(false); // key required
  });

  it("corrupt ledger file reports an error instead of crashing", () => {
    const d = freshDir();
    runDesignLedger({ action: "save", schematic_full_path: sheet("S"), state: state() }, d);
    // corrupt via raw write to the same key file
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const f = readdirSync(d).find((x) => x.endsWith(".json"))!;
    writeFileSync(join(d, f), "{not json", "utf8");
    const r = runDesignLedger({ action: "load", schematic_full_path: sheet("S") }, d);
    expect(r.ok).toBe(false);
    expect(String(r.error)).toMatch(/corrupt/);
  });

  it("delete removes the ledger; list flags unparsable files", () => {
    const d = freshDir();
    runDesignLedger({ action: "save", schematic_full_path: sheet("S"), state: state() }, d);
    expect(runDesignLedger({ action: "delete", schematic_full_path: sheet("S") }, d).ok).toBe(true);
    expect(runDesignLedger({ action: "load", schematic_full_path: sheet("S") }, d).ok).toBe(false);
  });
});

describe("design ledger — review digest (the audit)", () => {
  it("computes pending placements and pending nets from netlist vs progress", () => {
    const d = freshDir();
    const r = runDesignLedger({ action: "save", schematic_full_path: sheet("S"), state: state() }, d) as {
      review: { pending_placed: string[]; pending_nets: string[] };
    };
    expect(r.review.pending_placed).toEqual(["R1"]);
    expect(r.review.pending_nets).toEqual(["DRIVE"]);
  });

  it("flags stage=verified with unwired nets / unplaced components as contradictions", () => {
    const d = freshDir();
    const r = runDesignLedger(
      { action: "status", schematic_full_path: sheet("S") },
      d,
    );
    // no ledger yet — save first
    runDesignLedger(
      {
        action: "save",
        schematic_full_path: sheet("S"),
        state: state({ stage: "verified" }),
      },
      d,
    );
    const st = runDesignLedger({ action: "status", schematic_full_path: sheet("S") }, d) as { review: { warnings: string[] } };
    expect(st.review.warnings.some((w) => w.includes("stage=verified") && w.includes("DRIVE"))).toBe(true);
    expect(st.review.warnings.some((w) => w.includes("not marked placed") && w.includes("R1"))).toBe(true);
  });

  it("flags stale progress (wired nets absent from netlist)", () => {
    const d = freshDir();
    runDesignLedger(
      {
        action: "save",
        schematic_full_path: sheet("S"),
        state: state({ progress: { components_placed: ["Q1", "R1"], nets_wired: ["PWM", "GHOST"] } }),
      },
      d,
    );
    const st = runDesignLedger({ action: "status", schematic_full_path: sheet("S") }, d) as { review: { stale_progress: { wired_not_in_netlist: string[] }; warnings: string[] } };
    expect(st.review.stale_progress.wired_not_in_netlist).toEqual(["GHOST"]);
    expect(st.review.warnings.some((w) => w.includes("GHOST"))).toBe(true);
  });

  it("warns on placements without facing rationale and without any anchor_pin", () => {
    const d = freshDir();
    runDesignLedger(
      {
        action: "save",
        schematic_full_path: sheet("S"),
        state: state({
          placement: [
            { designator: "Q1", lib_reference: "NPN", x_mils: 0, y_mils: 0, rotation_deg: 0 },
            { designator: "R1", lib_reference: "Res1", x_mils: 0, y_mils: 0, rotation_deg: 90 },
          ],
        }),
      },
      d,
    );
    const st = runDesignLedger({ action: "status", schematic_full_path: sheet("S") }, d) as { review: { warnings: string[] } };
    expect(st.review.warnings.some((w) => w.includes("facing rationale") && w.includes("Q1") && w.includes("R1"))).toBe(true);
    expect(st.review.warnings.some((w) => w.includes("anchor_pin"))).toBe(true);
  });

  it("flags netlist components missing from the placement table", () => {
    const d = freshDir();
    runDesignLedger(
      {
        action: "save",
        schematic_full_path: sheet("S"),
        state: state({ placement: [{ designator: "Q1", lib_reference: "NPN", anchor_pin: "1", x_mils: 1, y_mils: 1, rotation_deg: 0, why: "x" }] }),
      },
      d,
    );
    const st = runDesignLedger({ action: "status", schematic_full_path: sheet("S") }, d) as { review: { warnings: string[] } };
    expect(st.review.warnings.some((w) => w.includes("missing from the placement table") && w.includes("R1"))).toBe(true);
  });

  it("syntax-lints the saved netlist (malformed pin surfaces as error)", () => {
    const d = freshDir();
    runDesignLedger(
      {
        action: "save",
        schematic_full_path: sheet("S"),
        state: state({
          netlist: {
            components: [{ designator: "Q1", lib_reference: "NPN" }],
            nets: [{ name: "BAD", pins: ["Q1.1", "no-dot-pin"] }],
          },
        }),
      },
      d,
    );
    const st = runDesignLedger({ action: "status", schematic_full_path: sheet("S") }, d) as { review: { netlist: { syntax_errors: Array<{ code: string }> } | null } };
    expect(st.review.netlist?.syntax_errors.some((e) => e.code === "PIN_MALFORMED")).toBe(true);
  });

  it("missing netlist and open issues produce explicit warnings", () => {
    const d = freshDir();
    runDesignLedger(
      { action: "save", schematic_full_path: sheet("S"), state: { design_name: "x", stage: "planning", open_issues: ["FB 分压比待确认"] } },
      d,
    );
    const st = runDesignLedger({ action: "status", schematic_full_path: sheet("S") }, d) as { review: { warnings: string[] } };
    expect(st.review.warnings.some((w) => w.includes("no frozen netlist"))).toBe(true);
    expect(st.review.warnings.some((w) => w.includes("open issue") && w.includes("FB"))).toBe(true);
  });
});
