import { describe, expect, it } from "vitest";
import type { PinTableEntry } from "../src/tools/pinTable.js";
import {
  allocateDesignators,
  listModuleTemplateNames,
  loadModuleTemplate,
  mergeParams,
  planModuleInstance,
  preflightModuleInstance,
} from "../src/tools/moduleTemplates.js";

const buck = (): ReturnType<typeof loadModuleTemplate> => loadModuleTemplate("buck-input-stage");

describe("template loader", () => {
  it("loads and validates the shipped buck-input-stage template", () => {
    const t = buck();
    expect(t.name).toBe("buck-input-stage");
    expect(t.components.length).toBe(6);
    expect(t.nets.length).toBe(4);
    for (const c of t.components) {
      expect(Array.isArray(t.layout[c.slot])).toBe(true);
    }
  });
  it("lists templates from the templates directory", () => {
    const names = listModuleTemplateNames();
    expect(names).toContain("buck-input-stage");
  });
  it("rejects unknown template names with the available list", () => {
    expect(() => loadModuleTemplate("no-such-template")).toThrow(/buck-input-stage/);
  });
});

describe("allocateDesignators", () => {
  it("allocates next-free designators per prefix", () => {
    const des = allocateDesignators(buck(), ["J1", "C1", "C2", "R1", "R2", "R3", "D1", "D2"]);
    // J: existing max 1 -> J2; D: max 2 -> D3; C: max 2 -> C3,C4; R: max 3 -> R4,R5
    expect(des.J_IN).toBe("J2");
    expect(des.D_REV).toBe("D3");
    expect(des.C_BULK).toBe("C3");
    expect(des.C_HF).toBe("C4");
    expect(des.R_UV1).toBe("R4");
    expect(des.R_UV2).toBe("R5");
  });
  it("handles a fresh sheet (no existing components)", () => {
    const des = allocateDesignators(buck(), []);
    expect(des.J_IN).toBe("J1");
    expect(des.C_BULK).toBe("C1");
    expect(des.C_HF).toBe("C2");
  });
  it("skips designators already in use (gaps in the sequence)", () => {
    const des = allocateDesignators(buck(), ["C1", "C2", "C3"]);
    expect(des.C_BULK).toBe("C4");
    expect(des.C_HF).toBe("C5");
  });
});

describe("mergeParams", () => {
  it("fills defaults and applies overrides", () => {
    const p = mergeParams(buck(), { c_bulk_uf: 220 });
    expect(p.c_bulk_uf).toBe(220);
    expect(p.c_hf_uf).toBe(1);
    expect(p.r_uv1_k).toBe(100);
  });
  it("unknown params are errors (typo protection)", () => {
    expect(() => mergeParams(buck(), { c_bulK_uf: 220 })).toThrow(/unknown param/);
  });
});

describe("planModuleInstance", () => {
  it("maps slots to allocated designators and offsets to absolute positions", () => {
    const inst = planModuleInstance(buck(), ["J1", "R1"], { x_mils: 5000, y_mils: 2000 }, { r_uv2_k: 33 });
    const bySlot = new Map(inst.components.map((c) => [c.slot, c]));
    expect(bySlot.get("J_IN")).toMatchObject({ designator: "J2", x_mils: 5000, y_mils: 2000 });
    expect(bySlot.get("R_UV2")).toMatchObject({ designator: "R3", x_mils: 7600, y_mils: 1300 });
    expect(bySlot.get("R_UV2").anchor_pin).toBe("1");
    expect(bySlot.get("R_UV2").anchor_target_x_mils).toBe(7600);
    expect(bySlot.get("R_UV2").value).toBe("33k");
    // nets use allocated designators, not slot names
    const vin = inst.nets.find((n) => n.name === "VIN");
    expect(vin.pins).toEqual(["D1.1", "C1.1", "C2.1", "R2.1"]);
    const gnd = inst.nets.find((n) => n.name === "GND");
    expect(gnd.pins).toContain("J2.2");
  });
  it("values without params resolve to null", () => {
    const inst = planModuleInstance(buck(), [], { x_mils: 0, y_mils: 0 });
    const j = inst.components.find((c) => c.slot === "J_IN");
    expect(j.value).toBeNull();
  });
});

describe("preflightModuleInstance", () => {
  const tables = () => {
    const mk = (lib: string, pins: string[]): PinTableEntry => ({
      lib_reference: lib,
      description: "",
      default_designator: "",
      part_count: 1,
      library_name: "TestLib",
      also_in_libraries: [],
      pins: pins.map((n) => ({
        number: n,
        name: n,
        electrical_type: "eElectricPassive",
        orientation_deg: 0,
        x: 0,
        y: 0,
        pin_length_mils: 100,
        owner_part_id: 1,
        hotspot_dx: 100,
        hotspot_dy: 0,
      })),
    });
    return new Map<string, PinTableEntry>([
      ["header 2", mk("Header 2", ["1", "2"])],
      ["diode 18tq045", mk("Diode 18TQ045", ["3", "1"])],
      ["cap", mk("Cap", ["1", "2"])],
      ["res1", mk("Res1", ["1", "2"])],
    ]);
  };

  it("passes when all symbols and pin refs match the tables", () => {
    const inst = planModuleInstance(buck(), [], { x_mils: 0, y_mils: 0 });
    const issues = preflightModuleInstance(inst, buck(), tables());
    expect(issues).toEqual([]);
  });

  it("flags a missing symbol with zero side effects", () => {
    const t = tables();
    t.delete("diode 18tq045");
    const inst = planModuleInstance(buck(), [], { x_mils: 0, y_mils: 0 });
    const issues = preflightModuleInstance(inst, buck(), t);
    expect(issues.some((i) => i.code === "SYMBOL_NOT_IN_LIBRARY" && i.message.includes("Diode 18TQ045"))).toBe(true);
  });

  it("flags a wrong pin number with the available list", () => {
    const t = tables();
    t.set("diode 18tq045", {
      ...(t.get("diode 18tq045") as PinTableEntry),
      pins: (t.get("diode 18tq045") as PinTableEntry).pins.map((p) => ({ ...p, number: p.number === "3" ? "5" : "2" })),
    });
    const inst = planModuleInstance(buck(), [], { x_mils: 0, y_mils: 0 });
    const issues = preflightModuleInstance(inst, buck(), t);
    expect(issues.some((i) => i.code === "PIN_NOT_ON_SYMBOL" && i.message.includes('no pin "3"'))).toBe(true);
  });
});

describe("anchor-pin placement", () => {
  const entry = (pins: Array<[string, number, number, number, number, number]>): PinTableEntry =>
    ({
      lib_reference: "Sym",
      description: "",
      default_designator: "U",
      part_count: 1,
      library_name: "Lib",
      also_in_libraries: [],
      pins: pins.map(([number, x, y, len, odeg, owner]) => ({
        number,
        name: number,
        electrical_type: "eElectricPassive",
        orientation_deg: odeg,
        x,
        y,
        pin_length_mils: len,
        hotspot_dx: odeg === 0 ? len : odeg === 180 ? -len : 0,
        hotspot_dy: odeg === 90 ? len : odeg === 270 ? -len : 0,
        owner_part_id: owner,
      })),
    }) as PinTableEntry;

  it("rot0 hotspot offset = pin location + free-end extension", async () => {
    // Res1-style: pin1 body end (-100,-100) pointing LEFT (180°, len 100)
    const e = entry([["1", -0, -100, 100, 180, 1], ["2", 200, -100, 100, 0, 1]]);
    const { pinHotspotOffsetAtRot0 } = await import("../src/tools/pinTable.js");
    expect(pinHotspotOffsetAtRot0(e.pins[0])).toEqual({ dx: -100, dy: -100 });
    expect(pinHotspotOffsetAtRot0(e.pins[1])).toEqual({ dx: 300, dy: -100 });
  });

  it("CCW rotation matrix reproduces AD22-measured offsets (Res1 pin1)", async () => {
    const { rotateOffsetCCW } = await import("../src/tools/pinTable.js");
    // rot0 hotspot offset (-100,-100) — measured rot90 (+100,-100), rot270 (-100,+100)
    expect(rotateOffsetCCW(-100, -100, 90)).toEqual({ dx: 100, dy: -100 });
    expect(rotateOffsetCCW(-100, -100, 180)).toEqual({ dx: 100, dy: 100 });
    expect(rotateOffsetCCW(-100, -100, 270)).toEqual({ dx: -100, dy: 100 });
    expect(rotateOffsetCCW(-100, -100, 0)).toEqual({ dx: -100, dy: -100 });
  });

  it("anchoredOrigin solves origin so the pin hotspot lands on target", async () => {
    const { anchoredOrigin } = await import("../src/tools/moduleTemplates.js");
    // Cap-style pin1 at rot270: rotated offset (-100,+100) (measured on Sheet2)
    const pin = entry([["1", 0, -200, 100, 90, 1]]).pins[0]; // rot0 hotspot (0,-100)... use measured-style instead:
    const cap = entry([["1", -100, -100, 0, 0, 1]]); // degenerate pin with hotspot == location (-100,-100)
    void pin;
    const o = anchoredOrigin(cap.pins[0], 270, { x: 7000, y: 1500 });
    expect(o).toEqual({ x: 7100, y: 1400 }); // 7000-(-100), 1500-(+100)
  });

  it("findTemplatePin matches pin numbers case-insensitively, null when missing", async () => {
    const { findTemplatePin } = await import("../src/tools/moduleTemplates.js");
    const tables = new Map([[ "res1", entry([["1", 0, -100, 100, 180, 1]]) ]]);
    expect(findTemplatePin(tables, "Res1", "1")?.number).toBe("1");
    expect(findTemplatePin(tables, "RES1", "a")).toBeNull();
    expect(findTemplatePin(tables, "nope", "1")).toBeNull();
  });
});
