import { describe, expect, it } from "vitest";
import {
  analyzeConnectivity,
  type AuditInput,
  type AuditPin,
  type AuditPinNet,
} from "../src/tools/checkConnectivity.js";

function pin(
  designator: string,
  pinDesignator: string,
  x: number,
  y: number,
  hidden = false,
): AuditPin {
  return { designator, pinDesignator, pinName: pinDesignator, x, y, isHidden: hidden };
}

function row(designator: string, pin: string, net: string, unconnected = false): AuditPinNet {
  return { designator, pin, net, unconnected };
}

function wire(index: number, ...pts: Array<[number, number]>) {
  return { index, vertices: pts.map(([x, y]) => ({ x, y })) };
}

const emptyGeo = { pins: [], wires: [], ports: [], labels: [], junctions: [] };

describe("check_connectivity DM mode (compiled net names)", () => {
  it("passes a correctly wired circuit", () => {
    const input: AuditInput = {
      ...emptyGeo,
      pins: [
        pin("R1", "1", 1000, 1000),
        pin("R1", "2", 1400, 1000),
        pin("Q1", "C", 1400, 2000),
      ],
      wires: [wire(0, [1000, 1000], [1400, 1000], [1400, 2000])],
      ports: [{ net: "VCC", x: 1000, y: 1000 }],
      pinNets: [
        row("R1", "1", "VCC"),
        row("R1", "2", "N1"),
        row("Q1", "C", "N1"),
      ],
    };
    const r = analyzeConnectivity(input);
    expect(r.ok).toBe(true);
    expect(r.data_source).toBe("compiled-dm");
    expect(r.summary.pins_total).toBe(3);
    expect(r.summary.pins_floating).toBe(0);
    expect(r.errors).toHaveLength(0);
  });

  it("flags SHORT_ACROSS_COMPONENT when one wire shorts a 2-pin part (R5 bug)", () => {
    // Res1 rotated 90 deg: pins stacked vertically at same x.
    // A long vertical wire passes through both hotspots.
    const input: AuditInput = {
      ...emptyGeo,
      pins: [pin("R1", "1", 5000, 3000), pin("R1", "2", 5000, 2600)],
      wires: [wire(0, [5000, 3500], [5000, 2200])],
      pinNets: [
        row("R1", "1", "N_SHORT"),
        row("R1", "2", "N_SHORT"),
      ],
    };
    const r = analyzeConnectivity(input);
    expect(r.ok).toBe(false);
    const err = r.errors.find((e) => e.code === "SHORT_ACROSS_COMPONENT");
    expect(err).toBeDefined();
    expect(err?.message).toContain("R1");
  });

  it("allows an IC with several GND pins on the GND power net", () => {
    const input: AuditInput = {
      ...emptyGeo,
      pins: [
        pin("U1", "1", 1000, 1000),
        pin("U1", "4", 1000, 1400),
        pin("U1", "5", 1000, 1800),
      ],
      ports: [{ net: "GND", x: 1000, y: 1000 }],
      pinNets: [
        row("U1", "1", "N_IN"),
        row("U1", "4", "GND"),
        row("U1", "5", "GND"),
      ],
    };
    const r = analyzeConnectivity(input);
    expect(r.ok).toBe(true);
    expect(r.errors.find((e) => e.code === "SHORT_ACROSS_COMPONENT")).toBeUndefined();
  });

  it("flags FLOAT_PIN when the compiler reports a '?' net", () => {
    const input: AuditInput = {
      ...emptyGeo,
      pins: [pin("R2", "1", 2000, 2000), pin("R2", "2", 2400, 2000)],
      wires: [wire(0, [2400, 2000], [2600, 2000])],
      pinNets: [
        row("R2", "1", "?", true),
        row("R2", "2", "N_X"),
      ],
    };
    const r = analyzeConnectivity(input);
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.code === "FLOAT_PIN")).toBeDefined();
    expect(r.summary.pins_floating).toBe(1);
  });

  it("flags POWER_NET_SHORT when VCC and GND merge", () => {
    // VCC port and GND port wired to the same compiled net.
    const input: AuditInput = {
      ...emptyGeo,
      pins: [pin("A", "1", 100, 100), pin("B", "1", 900, 100)],
      wires: [wire(0, [100, 100], [900, 100])],
      ports: [
        { net: "VCC", x: 100, y: 100 },
        { net: "GND", x: 900, y: 100 },
      ],
      pinNets: [
        row("A", "1", "VCC"),
        row("B", "1", "VCC"), // compiler merged GND into VCC
      ],
    };
    const r = analyzeConnectivity(input);
    const err = r.errors.find((e) => e.code === "POWER_NET_SHORT");
    expect(err).toBeDefined();
  });
});

describe("check_connectivity geometry fallback mode", () => {
  it("groups pins into nets by wires and ports", () => {
    const input: AuditInput = {
      ...emptyGeo,
      pins: [pin("R1", "1", 0, 0), pin("R1", "2", 100, 0)],
      wires: [wire(0, [0, 0], [100, 0])],
    };
    const r = analyzeConnectivity(input);
    expect(r.data_source).toBe("geometry-fallback");
    expect(r.ok).toBe(true);
    expect(r.summary.pins_connected).toBe(2);
    expect(r.nets).toHaveLength(1);
    expect(r.nets[0].pins).toEqual(["R1.1", "R1.2"]);
  });

  it("flags a floating pin", () => {
    const input: AuditInput = {
      ...emptyGeo,
      pins: [pin("R1", "1", 0, 0), pin("R1", "2", 100, 0)],
      wires: [wire(0, [0, 0], [50, 0])],
    };
    const r = analyzeConnectivity(input);
    expect(r.errors.find((e) => e.code === "FLOAT_PIN")).toBeDefined();
  });

  it("flags merged VCC/GND clusters", () => {
    const input: AuditInput = {
      ...emptyGeo,
      pins: [pin("A", "1", 0, 0), pin("B", "1", 100, 0)],
      wires: [wire(0, [0, 0], [100, 0])],
      ports: [
        { net: "VCC", x: 0, y: 0 },
        { net: "GND", x: 100, y: 0 },
      ],
    };
    const r = analyzeConnectivity(input);
    expect(r.errors.find((e) => e.code === "NET_NAME_SHORT")).toBeDefined();
  });
});

describe("check_connectivity geometry warnings (both modes)", () => {
  it("warns about a T-contact without junction and clears it once a junction exists", () => {
    const base = {
      pins: [pin("A", "1", 0, 0), pin("B", "1", 100, 0), pin("C", "1", 50, 100)],
      wires: [wire(0, [0, 0], [100, 0]), wire(1, [50, 100], [50, 0])],
    };
    const noJunction = analyzeConnectivity({ ...emptyGeo, ...base });
    expect(noJunction.warnings.find((w) => w.code === "T_CONTACT_NO_JUNCTION")).toBeDefined();

    const withJunction = analyzeConnectivity({
      ...emptyGeo,
      ...base,
      junctions: [{ x: 50, y: 0 }],
    });
    expect(withJunction.warnings.find((w) => w.code === "T_CONTACT_NO_JUNCTION")).toBeUndefined();
  });

  it("warns about dangling wire endpoints", () => {
    const input: AuditInput = {
      ...emptyGeo,
      pins: [pin("A", "1", 0, 0)],
      wires: [wire(0, [0, 0], [300, 300])], // diagonal, only touches pin at start
    };
    const r = analyzeConnectivity(input);
    expect(r.warnings.find((w) => w.code === "DANGLING_WIRE_ENDPOINT")).toBeDefined();
  });

  it("warns about a net label not touching any wire", () => {
    const input: AuditInput = {
      ...emptyGeo,
      labels: [{ net: "N1", x: 500, y: 500 }],
    };
    const r = analyzeConnectivity(input);
    expect(r.warnings.find((w) => w.code === "LABEL_NOT_ON_WIRE")).toBeDefined();
  });

  it("does not warn for a pure X crossing of two wires (normal routing)", () => {
    const input: AuditInput = {
      ...emptyGeo,
      wires: [wire(0, [0, 0], [100, 0]), wire(1, [50, -50], [50, 50])],
    };
    const r = analyzeConnectivity(input);
    expect(r.warnings.find((w) => w.code === "T_CONTACT_NO_JUNCTION")).toBeUndefined();
  });
});
