import { describe, expect, it } from "vitest";
import type { AuditPin, AuditPinNet, AuditPort, AuditWire } from "../src/tools/checkConnectivity.js";
import {
  chooseGrid,
  componentKeepOutRects,
  computeWireNets,
  junctionPointsFor,
  keyOf,
  manhattanMst,
  partitionOf,
  routePair,
  segRel,
  type Polyline,
} from "../src/tools/schematicRouter.js";

const pt = (x: number, y: number) => ({ x, y });
const seg = (a: [number, number], b: [number, number]) => [pt(a[0], a[1]), pt(b[0], b[1])] as [ReturnType<typeof pt>, ReturnType<typeof pt>];

describe("segRel", () => {
  it("classifies proper X crossings", () => {
    expect(segRel(seg([0, 0], [1000, 1000]), seg([0, 1000], [1000, 0]))).toBe("cross");
    expect(segRel(seg([0, 0], [1000, 0]), seg([500, -500], [500, 500]))).toBe("cross");
  });
  it("classifies endpoint T/L contacts as touch", () => {
    expect(segRel(seg([0, 0], [1000, 0]), seg([500, 0], [500, 500]))).toBe("touch");
    expect(segRel(seg([0, 0], [1000, 0]), seg([1000, 0], [1000, 500]))).toBe("touch");
  });
  it("classifies collinear overlap vs collinear-disjoint", () => {
    expect(segRel(seg([0, 0], [1000, 0]), seg([500, 0], [1500, 0]))).toBe("overlap");
    expect(segRel(seg([0, 0], [1000, 0]), seg([2000, 0], [3000, 0]))).toBe("none");
    // collinear meeting at exactly one point = touch, not overlap
    expect(segRel(seg([0, 0], [1000, 0]), seg([1000, 0], [2000, 0]))).toBe("touch");
  });
  it("classifies disjoint segments as none", () => {
    expect(segRel(seg([0, 0], [1000, 0]), seg([0, 500], [1000, 500]))).toBe("none");
  });
});

describe("chooseGrid", () => {
  it("prefers the largest grid all endpoints lie on", () => {
    expect(chooseGrid([[1000, 2000], [3000, 2000]])).toBe(100);
    expect(chooseGrid([[1050, 2000], [3050, 2000]])).toBe(50);
    expect(chooseGrid([[1060, 2020], [3060, 2020]])).toBe(20);
    expect(chooseGrid([[1010, 2030], [3010, 2030]])).toBe(10);
  });
  it("throws when a point is off the 10-mil grid", () => {
    expect(() => chooseGrid([[1057, 2000], [3057, 2000]])).toThrow(/off the 10-mil grid/);
  });
});

function pin(des: string, pinNo: string, x: number, y: number, net?: string): { pin: AuditPin; net?: string } {
  return { pin: { designator: des, pinDesignator: pinNo, pinName: pinNo, x, y, isHidden: false }, net };
}

describe("routePair", () => {
  const pins: AuditPin[] = [
    pin("R1", "1", 1000, 1000).pin,
    pin("R1", "2", 1400, 1000).pin,
    pin("D1", "1", 3000, 1000).pin,
    pin("D1", "2", 3400, 1000).pin,
  ];
  const pinNetOf = new Map<string, string>([
    ["R1.1", "A"], ["R1.2", "B"],
    ["D1.1", "B"], ["D1.2", "C"],
  ]);

  it("routes an aligned pair as a straight line", () => {
    const pts = routePair([1400, 1000], [3000, 1000], {
      net: "B", pins, pinNetOf, obstacles: [], allowedContacts: new Set([keyOf(1400, 1000), keyOf(3000, 1000)]),
    });
    expect(pts.length).toBe(2);
    expect(pts[0]).toEqual([1400, 1000]);
    expect(pts[1]).toEqual([3000, 1000]);
  });

  it("routes an L around a foreign-net wire crossing the direct path", () => {
    // Foreign wire blocks the straight corridor at y=1000 between x=1600..2800.
    const obstacle: Polyline = { pts: [[1600, 1000], [2800, 1000]], net: "X" };
    const pts = routePair([1400, 1000], [3000, 1000], {
      net: "B", pins, pinNetOf, obstacles: [obstacle], allowedContacts: new Set([keyOf(1400, 1000), keyOf(3000, 1000)]),
    });
    expect(pts.length).toBeGreaterThanOrEqual(3);
    // No vertex on the obstacle span (an overlap would be a short).
    for (let i = 0; i + 1 < pts.length; i++) {
      const rel = segRel(
        seg([pts[i][0], pts[i][1]], [pts[i + 1][0], pts[i + 1][1]]),
        seg([1600, 1000], [2800, 1000]),
      );
      expect(rel === "none" || rel === "cross").toBe(true);
    }
  });

  it("same-net obstacles are pass-through", () => {
    const obstacle: Polyline = { pts: [[1600, 1000], [2800, 1000]], net: "B" };
    const pts = routePair([1400, 1000], [3000, 1000], {
      net: "B", pins, pinNetOf, obstacles: [obstacle], allowedContacts: new Set([keyOf(1400, 1000), keyOf(3000, 1000)]),
    });
    expect(pts).toEqual([[1400, 1000], [3000, 1000]]);
  });

  it("throws a descriptive error when fully boxed in", () => {
    // Grid-aligned box around (1400,1000): every outgoing grid edge ends
    // mid-span ON a foreign wall (touch, not allowed) — no safe route exists.
    const obstacles: Polyline[] = [
      { pts: [[1300, 900], [1500, 900]], net: "X" },
      { pts: [[1300, 1100], [1500, 1100]], net: "X" },
      { pts: [[1300, 900], [1300, 1100]], net: "X" },
      { pts: [[1500, 900], [1500, 1100]], net: "X" },
    ];
    expect(() =>
      routePair([1400, 1000], [3000, 1000], {
        net: "B", pins, pinNetOf, obstacles,
        allowedContacts: new Set([keyOf(1400, 1000), keyOf(3000, 1000)]),
      }),
    ).toThrow(/no safe route/);
  });

  it("returns [] for coincident endpoints", () => {
    const pts = routePair([1400, 1000], [1400, 1000], {
      net: "B", pins, pinNetOf, obstacles: [], allowedContacts: new Set(),
    });
    expect(pts).toEqual([]);
  });
});

describe("manhattanMst", () => {
  it("connects all nodes with n-1 edges", () => {
    const edges = manhattanMst([pt(0, 0), pt(100, 0), pt(100, 100), pt(300, 100)]);
    expect(edges.length).toBe(3);
  });
  it("returns no edges for <2 nodes", () => {
    expect(manhattanMst([pt(0, 0)])).toEqual([]);
  });
});

describe("junctionPointsFor", () => {
  it("marks a T-contact endpoint on a same-net segment", () => {
    const wires: Polyline[] = [
      { pts: [[1000, 1000], [2000, 1000]], net: "N" },
      { pts: [[1500, 1000], [1500, 1500]], net: "N" },
    ];
    const j = junctionPointsFor(wires);
    expect(j).toEqual([[1500, 1000]]);
  });
  it("no junction for endpoint-to-endpoint contact", () => {
    const wires: Polyline[] = [
      { pts: [[1000, 1000], [1500, 1000]], net: "N" },
      { pts: [[1500, 1000], [1500, 1500]], net: "N" },
    ];
    expect(junctionPointsFor(wires)).toEqual([]);
  });
  it("ignores different-net contacts", () => {
    const wires: Polyline[] = [
      { pts: [[1000, 1000], [2000, 1000]], net: "A" },
      { pts: [[1500, 1000], [1500, 1500]], net: "B" },
    ];
    expect(junctionPointsFor(wires)).toEqual([]);
  });
});

describe("computeWireNets / partitionOf", () => {
  it("labels wires by the pin they touch and builds the net partition", () => {
    const pins = [
      pin("R1", "1", 1000, 1000, "A").pin,
      pin("R1", "2", 1400, 1000, "B").pin,
      pin("D1", "1", 1400, 2000, "B").pin,
    ];
    const wires: AuditWire[] = [
      { index: 0, vertices: [pt(1400, 1000), pt(1400, 2000)] },
      { index: 1, vertices: [pt(1000, 1000), pt(900, 1000)] },
    ];
    const ports: AuditPort[] = [];
    const pinNets: AuditPinNet[] = [
      { designator: "R1", pin: "1", net: "A", unconnected: false },
      { designator: "R1", pin: "2", net: "B", unconnected: false },
      { designator: "D1", pin: "1", net: "B", unconnected: false },
    ];
    const nets = computeWireNets(pins, wires, ports, pinNets);
    expect(nets.get(0)).toBe("B");
    expect(nets.get(1)).toBe("A");

    const partition = partitionOf(pinNets);
    expect(partition.size).toBe(2);
    expect(partition.has("R1.1")).toBe(true);
    expect(partition.has("D1.1 | R1.2")).toBe(true);
  });
});

describe("componentKeepOutRects + body-avoiding routes", () => {
  const pinsOf = (rows: Array<[string, string, number, number]>): AuditPin[] =>
    rows.map(([designator, pinDesignator, x, y]) => ({ designator, pinDesignator, pinName: pinDesignator, x, y }));

  it("same-side pins + origin complete the hull (connector case)", () => {
    // J1 rot180: both pin tips right of the body; origin sits inside the body
    const pins = pinsOf([["J1", "1", 5700, 1500], ["J1", "2", 5700, 1600]]);
    const rects = componentKeepOutRects(pins, [{ designator: "J1", x: 5500, y: 1400 }]);
    expect(rects).toEqual([[5500, 1400, 5700, 1600]]);
  });

  it("opposite-side pins span the body (resistor/cap case)", () => {
    const pins = pinsOf([["R1", "1", 7800, 1600], ["R1", "2", 7800, 1200]]);
    const rects = componentKeepOutRects(pins, [{ designator: "R1", x: 7900, y: 1500 }]);
    expect(rects).toEqual([[7800, 1200, 7900, 1600]]);
  });

  it("components without pins are skipped", () => {
    expect(componentKeepOutRects([], [{ designator: "X1", x: 0, y: 0 }])).toEqual([]);
  });

  it("routes detour around a body hull instead of crossing it", () => {
    // A ---- [ body hull 1400..1600 x 2000..2600 ] ---- B, straight line blocked
    const a: [number, number] = [1000, 1500];
    const b: [number, number] = [4000, 1500];
    const opts = {
      net: "N1",
      pins: [],
      pinNetOf: new Map<string, string>(),
      obstacles: [] as Polyline[],
      allowedContacts: new Set([keyOf(a[0], a[1]), keyOf(b[0], b[1])]),
      bodyRects: [[2000, 1400, 2600, 1600]] as Array<[number, number, number, number]>,
    };
    const pts = routePair(a, b, opts);
    // no route vertex may sit strictly inside the hull (margin 10)
    for (const [x, y] of pts) {
      const inside = x > 2010 && x < 2590 && y > 1410 && y < 1590;
      expect(inside).toBe(false);
    }
    // and the route still connects the endpoints
    expect(pts[0]).toEqual(a);
    expect(pts[pts.length - 1]).toEqual(b);
  });
});
