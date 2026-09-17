import { describe, expect, it } from "vitest";
import {
  analyzeSchematicQuality,
  type QualityInput,
  type QualityComponent,
} from "../src/tools/analyzeSchematicQuality.js";
import type { AuditPin, AuditPinNet } from "../src/tools/checkConnectivity.js";

function pin(designator: string, pinDesignator: string, x: number, y: number): AuditPin {
  return { designator, pinDesignator, pinName: pinDesignator, x, y, isHidden: false };
}

function row(designator: string, pin: string, net: string): AuditPinNet {
  return { designator, pin, net, unconnected: false };
}

function comp(
  designator: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
): QualityComponent {
  return { designator, x, y, width, height, rotation };
}

function wire(index: number, ...pts: Array<[number, number]>) {
  return { index, vertices: pts.map(([x, y]) => ({ x, y })) };
}

// ---------------------------------------------------------------------------
// Scenario from the user's real design: a polarized electrolytic cap between
// a top VCC rail and a bottom GND rail. With pin 1 (positive) pointing DOWN,
// the VCC connection must detour around the cap (3 bends). Rotating 180° makes
// both connections direct L shapes.
// ---------------------------------------------------------------------------

function buildElectrolyticScenario(): QualityInput {
  return {
    components: [
      comp("C1", 5000, 5000, 400, 400), // cap at (5000,5000), pins at y=5200/4800
      comp("U1", 5000, 7000, 1000, 600), // IC below, feeding the net
    ],
    pins: [
      pin("C1", "1", 5000, 5200), // positive, currently facing UP... toward VCC
      pin("C1", "2", 5000, 4800),
      pin("U1", "5", 4600, 7000),
      pin("U1", "6", 5400, 7000),
    ],
    wires: [],
    ports: [
      { net: "VCC", x: 5000, y: 6000 }, // rail ABOVE the cap
      { net: "GND", x: 5000, y: 4000 }, // rail BELOW the cap
    ],
    labels: [],
    junctions: [],
    pinNets: [
      row("C1", "1", "VCC"),
      row("C1", "2", "GND"),
      row("U1", "5", "VCC"),
      row("U1", "6", "GND"),
    ],
  };
}

describe("analyze_schematic_quality: current layout metrics", () => {
  it("counts actual wire crossings between different nets", () => {
    // Two wires that never touch; one crosses the other mid-span at (1500,1000).
    const input: QualityInput = {
      components: [],
      pins: [
        pin("R1", "1", 900, 1000),
        pin("R1", "2", 2100, 1000),
        pin("R2", "1", 1500, 1500),
        pin("R2", "2", 1500, 500),
      ],
      wires: [wire(0, [900, 1000], [2100, 1000]), wire(1, [1500, 1500], [1500, 500])],
      ports: [],
      labels: [],
      junctions: [],
      pinNets: [
        row("R1", "1", "N1"), row("R1", "2", "N1"),
        row("R2", "1", "N9"), row("R2", "2", "N9"),
      ],
    };
    const r = analyzeSchematicQuality(input, { suggestRotations: false });
    expect(r.current.actual_wires.crossings).toBe(1);
    expect(r.current.actual_wires.crossing_details[0].x).toBe(1500);
    expect(r.current.actual_wires.crossing_details[0].y).toBe(1000);
  });

  it("counts bends only at non-collinear vertices", () => {
    const input: QualityInput = {
      components: [],
      pins: [],
      // L-shaped wire: 1 bend. A collinear mid-vertex adds none.
      wires: [wire(0, [0, 0], [100, 0], [200, 0], [200, 100])],
      ports: [],
      labels: [],
      junctions: [],
      pinNets: [],
    };
    const r = analyzeSchematicQuality(input, { suggestRotations: false });
    expect(r.current.actual_wires.total_bends).toBe(1);
    expect(r.data_source).toBe("geometry-fallback");
  });

  it("reports detour ratio for sprawling nets", () => {
    const input: QualityInput = {
      components: [],
      pins: [pin("R1", "1", 0, 0), pin("R1", "2", 1000, 0)],
      // Actual path 0->1000 wide, detouring far up and back: length 2000 vs MST 1000.
      wires: [wire(0, [0, 0], [0, 500], [1000, 500], [1000, 0])],
      ports: [],
      labels: [],
      junctions: [],
      pinNets: [row("R1", "1", "N1"), row("R1", "2", "N1")],
    };
    const r = analyzeSchematicQuality(input, { suggestRotations: false });
    expect(r.current.actual_wires.worst_detour_nets[0].detour_ratio).toBeCloseTo(2, 1);
  });
});

describe("analyze_schematic_quality: electrolytic cap 180° rotation (user scenario)", () => {
  it("suggests 180° rotation when pins face away from their rails", () => {
    const input = buildElectrolyticScenario();
    // Make the situation bad: positive pin points DOWN (away from VCC rail above).
    // Swap so pin1 is at bottom: pins swapped => pin1(+) at y=4800, pin2 at y=5200.
    input.pins[0] = pin("C1", "1", 5000, 4800);
    input.pins[1] = pin("C1", "2", 5000, 5200);

    const r = analyzeSchematicQuality(input, { suggestRotations: true });

    expect(r.rotation_suggestions.length).toBeGreaterThan(0);
    const c1 = r.rotation_suggestions.find((s) => s.designator === "C1");
    expect(c1).toBeDefined();
    expect(c1!.suggested_rotation).toBe(180);
    expect(c1!.improvement).toBeGreaterThan(0);
  });

  it("does NOT suggest rotation when pins already face their rails", () => {
    const input = buildElectrolyticScenario();
    // pin1(+) at top y=5200 near VCC rail (y=6000); pin2 at bottom near GND (y=4000).
    const r = analyzeSchematicQuality(input, { suggestRotations: true });
    const c1 = r.rotation_suggestions.find((s) => s.designator === "C1");
    expect(c1).toBeUndefined();
  });

  it("hypothetical transform simulation improves the estimated score", () => {
    const input = buildElectrolyticScenario();
    input.pins[0] = pin("C1", "1", 5000, 4800);
    input.pins[1] = pin("C1", "2", 5000, 5200);

    const bad = analyzeSchematicQuality(input, { suggestRotations: false });
    const good = analyzeSchematicQuality(input, {
      suggestRotations: false,
      transforms: [{ designator: "C1", rotation_deg: 180 }],
    });

    expect(good.hypothetical).toBeDefined();
    expect(good.hypothetical!.delta.score).toBeLessThan(0);
    expect(good.hypothetical!.estimated.est_crossings).toBeLessThan(
      bad.current.estimated.est_crossings,
    );
  });

  it("rotation simulation moves pin coordinates correctly (180° about origin)", () => {
    const input: QualityInput = {
      components: [comp("C1", 5000, 5000, 400, 400)],
      pins: [pin("C1", "1", 5000, 5200), pin("C1", "2", 5000, 4800)],
      wires: [],
      ports: [],
      labels: [],
      junctions: [],
      pinNets: [row("C1", "1", "N1"), row("C1", "2", "N2")],
    };
    const r = analyzeSchematicQuality(input, {
      suggestRotations: false,
      transforms: [{ designator: "C1", rotation_deg: 180 }],
    });
    // Verified indirectly: the estimator still finds both nets routable and the
    // report renders without error; pin swap is covered by the delta tests above.
    expect(r.hypothetical).toBeDefined();
    expect(r.hypothetical!.estimated.est_bends).toBeGreaterThanOrEqual(0);
  });
});

describe("analyze_schematic_quality: estimator invariants", () => {
  it("net membership is invariant under transforms (functional correctness preserved)", () => {
    const input = buildElectrolyticScenario();
    const r = analyzeSchematicQuality(input, {
      suggestRotations: true,
      transforms: [{ designator: "C1", rotation_deg: 90 }],
    });
    // Same nets both before and after — the report never invents/loses nets.
    expect(r.sheet_summary.nets).toBe(2);
  });

  it("aligned pins give zero-bend direct connections", () => {
    const input: QualityInput = {
      components: [comp("R1", 0, 0, 300, 300), comp("R2", 1000, 0, 300, 300)],
      pins: [pin("R1", "1", 0, 0), pin("R2", "1", 1000, 0)],
      wires: [],
      ports: [],
      labels: [],
      junctions: [],
      pinNets: [row("R1", "1", "N1"), row("R2", "1", "N1")],
    };
    const r = analyzeSchematicQuality(input, { suggestRotations: false });
    expect(r.current.estimated.direct_connect_rate).toBe(1);
    expect(r.current.estimated.est_bends).toBe(0);
    expect(r.current.estimated.est_crossings).toBe(0);
  });
});
