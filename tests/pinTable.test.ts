import { describe, expect, it } from "vitest";
import { buildPinTable, type RawLibraryComponent } from "../src/tools/pinTable.js";
import { validateNetlist } from "../src/tools/validateNetlist.js";

const rawLib: RawLibraryComponent[] = [
  {
    lib_reference: "Res1",
    description: "Resistor",
    designator: "R?",
    part_count: 1,
    library_name: "Miscellaneous Devices.SchLib",
    pins: [
      { pin_number: "1", pin_name: "1", pin_type: "eElectricPassive", pin_orientation: "eRotate180", x: 350, y: 0, pin_length_mils: 100, owner_part_id: 1 },
      { pin_number: "2", pin_name: "2", pin_type: "eElectricPassive", pin_orientation: "eRotate0", x: 450, y: 0, pin_length_mils: 100, owner_part_id: 1 },
    ],
  },
  {
    lib_reference: "LED0",
    description: "LED",
    designator: "D?",
    part_count: 1,
    library_name: "Miscellaneous Devices.SchLib",
    pins: [
      { pin_number: "A", pin_name: "A", pin_type: "eElectricPassive", pin_orientation: "eRotate270", x: 400, y: 10, pin_length_mils: 100, owner_part_id: 1 },
      { pin_number: "K", pin_name: "K", pin_type: "eElectricPassive", pin_orientation: "eRotate90", x: 400, y: -10, pin_length_mils: 100, owner_part_id: 1 },
    ],
  },
  {
    lib_reference: "MCU8",
    description: "MCU with power pins",
    designator: "U?",
    part_count: 1,
    library_name: "Company.SchLib",
    pins: [
      { pin_number: "1", pin_name: "VCC", pin_type: "eElectricPower", pin_orientation: "eRotate270", x: 0, y: 50, pin_length_mils: 200, owner_part_id: 1 },
      { pin_number: "2", pin_name: "GND", pin_type: "eElectricPower", pin_orientation: "eRotate90", x: 0, y: -50, pin_length_mils: 200, owner_part_id: 1 },
      { pin_number: "3", pin_name: "IO1", pin_type: "eElectricIO", pin_orientation: "eRotate0", x: 100, y: 0, pin_length_mils: 100, owner_part_id: 1 },
    ],
  },
];

const tables = () => {
  const { matched } = buildPinTable(rawLib, ["Res1", "LED0", "MCU8"]);
  return new Map(matched.map((m) => [m.lib_reference.toLowerCase(), m]));
};

describe("buildPinTable", () => {
  it("matches case-insensitively and derives hotspot offsets along orientation", () => {
    const { matched, unmatched } = buildPinTable(rawLib, ["res1", "LED0", "Nope"]);
    expect(matched.map((m) => m.lib_reference)).toEqual(["Res1", "LED0"]);
    expect(unmatched).toEqual(["Nope"]);
    const res1 = matched[0];
    const pin1 = res1.pins.find((p) => p.number === "1")!;
    expect(pin1.orientation_deg).toBe(180);
    expect(pin1.hotspot_dx).toBe(-100); // eRotate180: hotspot at -length
    expect(pin1.hotspot_dy).toBe(0);
    const led = matched[1];
    const a = led.pins.find((p) => p.number === "A")!;
    expect(a.orientation_deg).toBe(270);
    expect(a.hotspot_dy).toBe(-100); // eRotate270: downward in Y-up coords
  });

  it("dedupes repeated requests", () => {
    const { matched } = buildPinTable(rawLib, ["Res1", "res1", "RES1"]);
    expect(matched.length).toBe(1);
  });
});

const goodNetlist = {
  components: [
    { designator: "R1", lib_reference: "Res1" },
    { designator: "D1", lib_reference: "LED0" },
    { designator: "U1", lib_reference: "MCU8" },
  ],
  nets: [
    { name: "VCC", pins: ["U1.1", "R1.1"] },
    { name: "GND", pins: ["U1.2"] },
    { name: "LED1", pins: ["R1.2", "D1.A"] },
    { name: "IO1", pins: ["U1.3", "D1.K"] },
  ],
};

describe("validateNetlist — pin-table mode", () => {
  it("accepts a correct netlist with full coverage", () => {
    const r = validateNetlist(goodNetlist, tables());
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("pin-tables");
    expect(r.errors).toEqual([]);
    expect(r.pin_coverage.distinct_pins).toBe(7);
    expect(r.pin_coverage.assigned_pins).toBe(7);
    expect(r.pin_coverage.unassigned_by_component).toEqual([]);
    expect(r.power_nets).toEqual(["VCC", "GND"]);
  });

  it("flags hallucinated pins with the available pin list", () => {
    const r = validateNetlist(
      {
        components: [{ designator: "R1", lib_reference: "Res1" }],
        nets: [{ name: "N1", pins: ["R1.2", "R1.7"] }],
      },
      tables(),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "PIN_NOT_ON_COMPONENT" && e.message.includes("no pin 7"))).toBe(true);
  });

  it("flags a pin assigned to two nets as a constructed short", () => {
    const r = validateNetlist(
      {
        components: [{ designator: "R1", lib_reference: "Res1" }],
        nets: [
          { name: "A", pins: ["R1.1", "R1.2"] },
          { name: "B", pins: ["R1.2"] },
        ],
      },
      tables(),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "PIN_IN_MULTIPLE_NETS")).toBe(true);
  });

  it("reports unassigned pins per component without failing", () => {
    const r = validateNetlist(
      {
        components: [
          { designator: "U1", lib_reference: "MCU8" },
          { designator: "R9", lib_reference: "Res1" },
        ],
        nets: [{ name: "VCC", pins: ["U1.1"] }],
      },
      tables(),
    );
    expect(r.ok).toBe(true);
    const unR9 = r.pin_coverage.unassigned_by_component.find((u) => u.designator === "R9");
    expect(unR9?.unassigned_pins.sort()).toEqual(["1", "2"]); // R9 fully forgotten
    const unU1 = r.pin_coverage.unassigned_by_component.find((u) => u.designator === "U1");
    expect(unU1?.unassigned_pins).toEqual(["2", "3"]); // partially used, fine
  });

  it("warns when a power pin sits on a non-power net", () => {
    const r = validateNetlist(
      {
        components: [{ designator: "U1", lib_reference: "MCU8" }],
        nets: [{ name: "SIG_X", pins: ["U1.1", "U1.2", "U1.3"] }],
      },
      tables(),
    );
    expect(r.warnings.some((e) => e.code === "POWER_PIN_OFF_POWER_NET")).toBe(true);
  });
});

describe("validateNetlist — syntax mode", () => {
  it("catches structural errors without pin tables", () => {
    const r = validateNetlist({
      components: [{ designator: "R1", lib_reference: "Res1" }],
      nets: [
        { name: "A", pins: ["R1.1", "R1.1"] }, // duplicate entry in one net
        { name: "A", pins: ["R1.2"] }, // duplicate net name
        { name: "B", pins: ["R1"] }, // malformed pin ref
        { name: "C", pins: ["X9.1"] }, // undeclared designator
      ],
    });
    expect(r.mode).toBe("syntax-only");
    expect(r.ok).toBe(false);
    const codes = r.errors.map((e) => e.code).sort();
    expect(codes).toContain("DUPLICATE_PIN_IN_NET");
    expect(codes).toContain("DUPLICATE_NET_NAME");
    expect(codes).toContain("PIN_MALFORMED");
    expect(codes).toContain("PIN_ON_UNDECLARED_COMPONENT");
  });

  it("warns on single-pin nets and naming conventions", () => {
    const r = validateNetlist({
      components: [{ designator: "R1", lib_reference: "Res1" }],
      nets: [{ name: "led 1", pins: ["R1.1"] }],
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === "SINGLE_PIN_NET")).toBe(true);
    expect(r.warnings.some((w) => w.code === "NET_NAME_CONVENTION")).toBe(true);
  });

  it("echoes the frozen netlist with normalized designators", () => {
    const r = validateNetlist(goodNetlist);
    expect(r.frozen_netlist.components.map((c) => c.designator)).toEqual(["R1", "D1", "U1"]);
    expect(r.frozen_netlist.nets.length).toBe(4);
  });
});
