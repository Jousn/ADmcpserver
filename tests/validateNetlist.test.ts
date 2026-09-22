import { describe, expect, it } from "vitest";
import type { PinTableEntry } from "../src/tools/pinTable.js";
import { validateNetlist } from "../src/tools/validateNetlist.js";

// Library fixtures mirroring real Miscellaneous Devices geometry (AD22-verified).
const entry = (
  libReference: string,
  pins: Array<[number, string, string]>,
): PinTableEntry =>
  ({
    lib_reference: libReference,
    description: "",
    default_designator: "U",
    part_count: 1,
    library_name: "Miscellaneous Devices",
    also_in_libraries: [],
    pins: pins.map(([n, name, type]) => ({
      number: String(n),
      name,
      electrical_type: type,
      orientation_deg: 0,
      x: 0,
      y: -100,
      pin_length_mils: 100,
      hotspot_dx: 100,
      hotspot_dy: 0,
      owner_part_id: 1,
    })),
  }) as PinTableEntry;

// NPN-style 3-pin + Res1-style 2-pin tables.
const tables = new Map<string, PinTableEntry>([
  ["npn", entry("NPN", [[1, "C", "eElectricPassive"], [2, "B", "eElectricInput"], [3, "E", "eElectricPassive"]])],
  ["res1", entry("Res1", [[1, "1", "eElectricPassive"], [2, "2", "eElectricPassive"]])],
]);

const components = [
  { designator: "Q1", lib_reference: "NPN" },
  { designator: "R1", lib_reference: "Res1" },
];

describe("validateNetlist strict pin coverage", () => {
  it("DRIVE-class regression: forgotten net -> PIN_UNASSIGNED error, ok=false (default strict)", () => {
    // The Sheet3 bug: R1.2 -> Q1.2 base drive was dropped from the netlist.
    const r = validateNetlist(
      {
        components,
        nets: [
          { name: "PWM", pins: ["R1.1"] },
          { name: "SW", pins: ["Q1.3"] },
        ],
      },
      tables,
    );
    expect(r.ok).toBe(false);
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain("PIN_UNASSIGNED");
    const driveErr = r.errors.find((e) => e.code === "PIN_UNASSIGNED" && e.message.includes("Q1"));
    expect(driveErr?.message).toMatch(/Q1.*pin\(s\).*2/);
    expect(r.pin_coverage.no_connect_pins).toBe(0);
  });

  it("every pin netted or no_connect -> ok=true", () => {
    const r = validateNetlist(
      {
        components,
        nets: [
          { name: "PWM", pins: ["R1.1"] },
          { name: "DRIVE", pins: ["R1.2", "Q1.2"] },
          { name: "SW", pins: ["Q1.3"] },
        ],
        no_connect: ["Q1.1"],
      },
      tables,
    );
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.pin_coverage.no_connect_pins).toBe(1);
    expect(r.frozen_netlist.no_connect).toEqual(["Q1.1"]);
  });

  it("strict=false downgrades forgotten pins to a note", () => {
    const r = validateNetlist(
      {
        components,
        nets: [{ name: "PWM", pins: ["R1.1"] }],
        strict_pin_coverage: false,
      },
      tables,
    );
    expect(r.ok).toBe(true);
    expect(r.errors.find((e) => e.code === "PIN_UNASSIGNED")).toBeUndefined();
    expect(r.notes.some((n) => n.includes("strict_pin_coverage=false"))).toBe(true);
  });

  it("pin both in a net and in no_connect -> PIN_NC_AND_NETTED", () => {
    const r = validateNetlist(
      {
        components,
        nets: [
          { name: "PWM", pins: ["R1.1"] },
          { name: "X", pins: ["R1.2"] },
        ],
        no_connect: ["R1.2"],
      },
      tables,
    );
    expect(r.errors.some((e) => e.code === "PIN_NC_AND_NETTED")).toBe(true);
  });

  it("hallucinated no_connect pin -> PIN_NOT_ON_COMPONENT", () => {
    const r = validateNetlist(
      {
        components,
        nets: [
          { name: "PWM", pins: ["R1.1"] },
          { name: "DRIVE", pins: ["R1.2", "Q1.2"] },
          { name: "SW", pins: ["Q1.3"] },
        ],
        no_connect: ["Q1.1", "Q1.9"],
      },
      tables,
    );
    expect(r.errors.some((e) => e.code === "PIN_NOT_ON_COMPONENT" && e.message.includes("Q1.9"))).toBe(true);
    // Q1.1 is a legit NC — must NOT be flagged
    expect(r.errors.some((e) => e.code === "PIN_NOT_ON_COMPONENT" && e.message.includes("Q1.1"))).toBe(false);
  });

  it("no_connect pin on undeclared designator -> NC_PIN_ON_UNDECLARED_COMPONENT", () => {
    const r = validateNetlist(
      { components, nets: [{ name: "PWM", pins: ["R1.1"] }], no_connect: ["X9.1"] },
      tables,
    );
    expect(r.errors.some((e) => e.code === "NC_PIN_ON_UNDECLARED_COMPONENT")).toBe(true);
  });

  it("syntax-only mode: strictness not enforced, explained in notes", () => {
    const r = validateNetlist(
      {
        components,
        nets: [{ name: "PWM", pins: ["R1.1"] }],
      },
      undefined,
    );
    expect(r.mode).toBe("syntax-only");
    expect(r.ok).toBe(true);
    expect(r.notes.some((n) => n.includes("strict_pin_coverage requires pin tables"))).toBe(true);
  });
});
