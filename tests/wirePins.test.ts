import { describe, expect, it } from "vitest";
import type { SchematicAuditData } from "../src/tools/schematicAuditData.js";
import { planWirePins } from "../src/tools/wirePins.js";
import { hillClimbPlacement, planFullRewire } from "../src/tools/optimizeLayout.js";
import { segRel } from "../src/tools/schematicRouter.js";

function auditFixture(): SchematicAuditData {
  return {
    pins: [
      // R1: 1000..1400 @ y=1000 (net B ends); J1 pin1 @ (600,1000) net VCC
      { designator: "R1", pinDesignator: "1", pinName: "1", x: 1000, y: 1000, isHidden: false },
      { designator: "R1", pinDesignator: "2", pinName: "2", x: 1400, y: 1000, isHidden: false },
      { designator: "D1", pinDesignator: "1", pinName: "1", x: 3000, y: 1000, isHidden: false },
      { designator: "D1", pinDesignator: "2", pinName: "2", x: 3400, y: 1000, isHidden: false },
    ],
    wires: [],
    ports: [],
    labels: [],
    junctions: [],
    pinNets: [],
    components: [
      { designator: "R1", x: 1200, y: 1000, width: 400, height: 300, rotation: 90 },
      { designator: "D1", x: 3200, y: 1000, width: 400, height: 300, rotation: 90 },
    ],
    dmAvailable: false,
  };
}

describe("planWirePins", () => {
  it("connects listed pins with exact-hotspot wires and reports endpoints", () => {
    const plan = planWirePins(auditFixture(), { net_name: "LED1", pins: ["R1.2", "D1.1"] });
    expect(plan.endpoints).toEqual([
      { pin: "R1.2", x: 1400, y: 1000 },
      { pin: "D1.1", x: 3000, y: 1000 },
    ]);
    expect(plan.wires.length).toBe(1);
    expect(plan.wires[0].pts[0]).toEqual([1400, 1000]);
    expect(plan.wires[0].pts.at(-1)).toEqual([3000, 1000]);
    expect(plan.junctions).toEqual([]);
  });

  it("treats same-net existing wires as joinable and foreign wires as obstacles", () => {
    const data = auditFixture();
    // Foreign net X blocks the direct corridor between R1.2 and D1.1.
    data.wires = [
      { index: 0, vertices: [{ x: 1600, y: 1000 }, { x: 2800, y: 1000 }] },
    ];
    const wireNetsFallback = new Map<number, string | null>([[0, "X"]]);
    // computeWireNets needs compiled pinNets to label the obstacle; feed DM rows.
    data.pinNets = [
      { designator: "R1", pin: "1", net: "VCC", unconnected: false },
      { designator: "R1", pin: "2", net: "LED1", unconnected: false },
      { designator: "D1", pin: "1", net: "LED1", unconnected: false },
      { designator: "D1", pin: "2", net: "GND", unconnected: false },
    ];
    void wireNetsFallback;
    const plan = planWirePins(data, { net_name: "LED1", pins: ["R1.2", "D1.1"] });
    expect(plan.wires.length).toBe(1);
    // The route must detour around y=1000 between 1600 and 2800.
    const pts = plan.wires[0].pts;
    expect(pts.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i + 1 < pts.length; i++) {
      const rel = segRel(
        [{ x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }],
        [{ x: 1600, y: 1000 }, { x: 2800, y: 1000 }],
      );
      expect(rel === "none" || rel === "cross").toBe(true);
    }
  });

  it("throws on unknown pin", () => {
    expect(() => planWirePins(auditFixture(), { net_name: "N", pins: ["R1.2", "Q9.1"] })).toThrow(/not found/);
  });

  it("throws when fewer than 2 distinct hotspots remain", () => {
    expect(() => planWirePins(auditFixture(), { net_name: "N", pins: ["R1.2", "R1.2"] })).toThrow(
      /fewer than 2/,
    );
  });
});

describe("hillClimbPlacement / planFullRewire", () => {
  it("hill climb improves or keeps the estimated score and reports changes", () => {
    const data = auditFixture();
    data.pinNets = [
      { designator: "R1", pin: "1", net: "VCC", unconnected: false },
      { designator: "R1", pin: "2", net: "LED1", unconnected: false },
      { designator: "D1", pin: "1", net: "LED1", unconnected: false },
      { designator: "D1", pin: "2", net: "GND", unconnected: false },
    ];
    const climb = hillClimbPlacement(data, 3);
    expect(climb.finalScore).toBeLessThanOrEqual(climb.initialScore);
    expect(climb.sweeps).toBeGreaterThanOrEqual(1);
    for (const c of climb.changes) {
      expect(typeof c.designator).toBe("string");
      expect([0, 90, 180, 270]).toContain(((Math.round(c.to.rotation) % 360) + 360) % 360);
    }
  });

  it("planFullRewire wires every multi-pin net and skips floating pins", () => {
    const data = auditFixture();
    data.pinNets = [
      { designator: "R1", pin: "1", net: "VCC", unconnected: false },
      { designator: "R1", pin: "2", net: "LED1", unconnected: false },
      { designator: "D1", pin: "1", net: "LED1", unconnected: false },
      { designator: "D1", pin: "2", net: "GND", unconnected: true },
    ];
    const plan = planFullRewire(data.pins, data.ports, data.pinNets, data.wires, data.junctions);
    // LED1 has 2 pins -> wired; VCC/GND single pin -> no wire.
    const nets = new Set(plan.wires.map((w) => w.net));
    expect(nets).toEqual(new Set(["LED1"]));
    // Original snapshot preserved for the restore path.
    expect(plan.originalWires).toEqual([]);
  });
});
