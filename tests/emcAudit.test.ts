import { describe, expect, it } from "vitest";
import {
  runEmcAudit,
  classifyNet,
  classifyComponent,
  parseCapacitanceF,
  parseResistanceOhm,
  EMC_RULE_CATALOG,
} from "../src/tools/emcAudit.js";
import type { SchematicAuditData } from "../src/tools/schematicAuditData.js";
import type { AuditPin } from "../src/tools/checkConnectivity.js";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** pinNets rows as [designator, pin, net]. */
function data(
  rows: Array<[string, string, string]>,
  params: Record<string, Record<string, string>> = {},
  pins: AuditPin[] = [],
  dmAvailable = true,
): SchematicAuditData {
  const desigs = [...new Set(rows.map((r) => r[0]))];
  return {
    components: desigs.map((d, i) => ({
      designator: d,
      x: i * 1000,
      y: 0,
      width: 400,
      height: 400,
      rotation: 0,
    })),
    pins,
    wires: [],
    ports: [],
    labels: [],
    junctions: [],
    pinNets: rows.map(([designator, pin, net]) => ({ designator, pin, net, unconnected: false })),
    componentParameters: params,
    dmAvailable,
  };
}

function findingsOf(report: ReturnType<typeof runEmcAudit>, ruleId: string) {
  return report.findings.filter((f) => f.rule_id === ruleId);
}

function passedOf(report: ReturnType<typeof runEmcAudit>, ruleId: string) {
  return report.checks_passed.find((p) => p.rule_id === ruleId);
}

// A small offline flyback-ish board reused by several rules:
// AC input L/N, PE, primary hot ground K1, secondary SGND, rails 5V.
function flybackBase(): SchematicAuditData {
  return data(
    [
      ["J1", "1", "L"],
      ["J1", "2", "N"],
      ["J1", "3", "PE"],
      ["FL1", "1", "L"],
      ["FL1", "2", "N"],
      ["C1", "1", "L"],
      ["C1", "2", "N"],
      ["C2", "1", "PE"],
      ["C2", "2", "K1"],
      ["U1", "1", "K1"],
      ["U1", "8", "5V"],
      ["C3", "1", "5V"],
      ["C3", "2", "SGND"],
      ["C4", "1", "5V"],
      ["C4", "2", "SGND"],
      ["U2", "1", "5V"],
      ["U2", "2", "SGND"],
      ["T1", "1", "K1"],
      ["T1", "2", "5V"],
    ],
    {
      C1: { Value: "0.47uF" },
      C2: { Value: "2.2nF" },
      C3: { Value: "10uF" },
      C4: { Value: "0.1uF" },
      FL1: { Value: "CM choke 10mH" },
      U1: { Description: "PWM switch" },
      T1: { Description: "transformer" },
    },
  );
}

// ---------------------------------------------------------------------------
// Classification + parsing
// ---------------------------------------------------------------------------

describe("emc_audit: net classification", () => {
  it("classifies line/PE/ground/rail nets", () => {
    expect(classifyNet("L")).toEqual({ kind: "line_l" });
    expect(classifyNet("AC_L")).toEqual({ kind: "line_l" });
    expect(classifyNet("N")).toEqual({ kind: "line_n" });
    expect(classifyNet("NEUTRAL")).toEqual({ kind: "line_n" });
    expect(classifyNet("PE")).toEqual({ kind: "pe" });
    expect(classifyNet("GND")).toEqual({ kind: "ground", subtype: "plain" });
    expect(classifyNet("PGND")).toEqual({ kind: "ground", subtype: "primary" });
    expect(classifyNet("K1")).toEqual({ kind: "ground", subtype: "primary" });
    expect(classifyNet("SGND")).toEqual({ kind: "ground", subtype: "logic" });
    expect(classifyNet("AGND")).toEqual({ kind: "ground", subtype: "logic" });
    expect(classifyNet("VCC")).toEqual({ kind: "rail" });
    expect(classifyNet("3V3")).toEqual({ kind: "rail" });
    expect(classifyNet("5V_MCU")).toEqual({ kind: "rail" });
    expect(classifyNet("+12V")).toEqual({ kind: "rail" });
    expect(classifyNet("SDA")).toEqual({ kind: "other" });
  });
});

describe("emc_audit: value parsing", () => {
  it("parses capacitance formats", () => {
    expect(parseCapacitanceF("100nF")).toBeCloseTo(100e-9, 12);
    expect(parseCapacitanceF("0.1uF")).toBeCloseTo(0.1e-6, 12);
    expect(parseCapacitanceF("4n7")).toBeCloseTo(4.7e-9, 12);
    expect(parseCapacitanceF("470pF")).toBeCloseTo(470e-12, 12);
    expect(parseCapacitanceF("103")).toBeCloseTo(10e-9, 12);
    expect(parseCapacitanceF("47")).toBeCloseTo(47e-12, 12);
    expect(parseCapacitanceF("0.1uF/50V X7R")).toBeCloseTo(0.1e-6, 12);
    expect(parseCapacitanceF("1uF 25V")).toBeCloseTo(1e-6, 12);
    expect(parseCapacitanceF(undefined)).toBeNull();
    expect(parseCapacitanceF("see datasheet")).toBeNull();
  });

  it("parses resistance formats", () => {
    expect(parseResistanceOhm("10k")).toBe(10e3);
    expect(parseResistanceOhm("0R")).toBe(0);
    expect(parseResistanceOhm("4R7")).toBeCloseTo(4.7, 12);
    expect(parseResistanceOhm("100")).toBe(100);
    expect(parseResistanceOhm("1M")).toBe(1e6);
    expect(parseResistanceOhm(undefined)).toBeNull();
  });
});

describe("emc_audit: component classification", () => {
  it("classifies prefixes and keyword overrides", () => {
    expect(classifyComponent("C10").kind).toBe("capacitor");
    expect(classifyComponent("R5").kind).toBe("resistor");
    expect(classifyComponent("T1").kind).toBe("transformer");
    expect(classifyComponent("U3").kind).toBe("ic");
    expect(classifyComponent("J2").kind).toBe("connector");
    expect(classifyComponent("X1").kind).toBe("crystal");
    expect(classifyComponent("Q1").kind).toBe("transistor");
    // Keyword overrides.
    expect(classifyComponent("Q3", { Value: "8MHz" }).kind).toBe("crystal");
    expect(classifyComponent("Q5", { Description: "NMOS transistor" }).kind).toBe("transistor");
    expect(classifyComponent("L2", { Description: "common mode choke" }).cmChoke).toBe(true);
    expect(classifyComponent("FL1").cmChoke).toBe(true);
    expect(classifyComponent("FB1").ferriteBead).toBe(true);
    expect(classifyComponent("L3", { Value: "Bead 600R@100MHz" }).ferriteBead).toBe(true);
    // Impedance-only values stay conservative: not recognized as beads.
    expect(classifyComponent("L4", { Value: "600R@100MHz" }).ferriteBead).toBe(false);
    // A choke-looking inductor must NOT be flagged as switching magnetic.
    expect(classifyComponent("L2", { Description: "common mode choke" }).cmChoke).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

describe("emc_audit S001/S002/S003: input filter presence", () => {
  it("S001 warns when L/N exist but no CM choke is recognizable", () => {
    const d = data([
      ["J1", "1", "L"],
      ["J1", "2", "N"],
      ["C1", "1", "L"],
      ["C1", "2", "N"],
    ]);
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S001");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("warning");
    expect(passedOf(r, "EMC-S002")).toBeTruthy(); // X cap C1 present
  });

  it("S001 passes with an FL-prefix choke", () => {
    const d = data([
      ["J1", "1", "L"],
      ["J1", "2", "N"],
      ["FL1", "1", "L"],
      ["FL1", "2", "N"],
    ]);
    const r = runEmcAudit(d);
    expect(findingsOf(r, "EMC-S001")).toHaveLength(0);
    expect(passedOf(r, "EMC-S001")).toBeTruthy();
  });

  it("S002 warns when no cap between L and N", () => {
    const d = data([
      ["J1", "1", "L"],
      ["J1", "2", "N"],
      ["FL1", "1", "L"],
      ["FL1", "2", "N"],
    ]);
    const r = runEmcAudit(d);
    expect(findingsOf(r, "EMC-S002")).toHaveLength(1);
  });

  it("S003 flags oversized X cap value", () => {
    const d = data(
      [
        ["J1", "1", "L"],
        ["J1", "2", "N"],
        ["C1", "1", "L"],
        ["C1", "2", "N"],
      ],
      { C1: { Value: "4.7uF" } },
    );
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S003");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("info");
    expect(String(f[0].evidence.parsed)).toContain("uF");
  });

  it("input rules skip entirely without L/N nets", () => {
    const d = data([
      ["U1", "1", "VCC"],
      ["U1", "2", "GND"],
    ]);
    const r = runEmcAudit(d);
    expect(r.findings.filter((f) => f.category === "conducted")).toHaveLength(0);
    expect(r.notes.some((n) => n.includes("EMC-S001"))).toBe(true);
  });
});

describe("emc_audit S004/S005: Y caps", () => {
  it("S004 warns when PE exists with no Y cap", () => {
    const d = data([
      ["J1", "3", "PE"],
      ["U1", "1", "PGND"],
    ]);
    const r = runEmcAudit(d);
    expect(findingsOf(r, "EMC-S004")).toHaveLength(1);
    expect(findingsOf(r, "EMC-S004")[0].severity).toBe("warning");
  });

  it("S004 passes with a PE-to-ground cap", () => {
    const d = data([
      ["J1", "3", "PE"],
      ["C1", "1", "PE"],
      ["C1", "2", "PGND"],
    ]);
    const r = runEmcAudit(d);
    expect(passedOf(r, "EMC-S004")).toBeTruthy();
  });

  it("S005 warns on oversized Y cap and degrades unparseable to info", () => {
    const d = data(
      [
        ["J1", "3", "PE"],
        ["C1", "1", "PE"],
        ["C1", "2", "PGND"],
        ["C2", "1", "PE"],
        ["C2", "2", "PGND"],
      ],
      { C1: { Value: "10nF" }, C2: { Value: "Y-CAP A" } },
    );
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S005");
    expect(f).toHaveLength(2);
    expect(f.find((x) => x.evidence.designator === "C1")!.severity).toBe("warning");
    expect(f.find((x) => Array.isArray(x.evidence.designators) && x.evidence.designators.includes("C2"))!.severity).toBe("info");
  });

  it("S005 honors threshold override", () => {
    const d = data(
      [
        ["J1", "3", "PE"],
        ["C1", "1", "PE"],
        ["C1", "2", "PGND"],
      ],
      { C1: { Value: "10nF" } },
    );
    const r = runEmcAudit(d, { thresholds: { y_cap_max_nf: 22 } });
    expect(findingsOf(r, "EMC-S005")).toHaveLength(0);
    expect(passedOf(r, "EMC-S005")).toBeTruthy();
  });
});

describe("emc_audit S010/S011: decoupling", () => {
  it("S010 warns when an IC rail has no decoupling cap", () => {
    const d = data([
      ["U1", "1", "3V3"],
      ["U1", "2", "GND"],
    ]);
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S010");
    expect(f).toHaveLength(1);
    expect(f[0].evidence.rail).toBe("3V3");
  });

  it("S010 passes when a rail-to-ground cap exists", () => {
    const d = data([
      ["U1", "1", "3V3"],
      ["U1", "2", "GND"],
      ["C1", "1", "3V3"],
      ["C1", "2", "GND"],
    ]);
    const r = runEmcAudit(d);
    expect(passedOf(r, "EMC-S010")).toBeTruthy();
  });

  it("S011 flags bulk-only rails and passes with an HF cap", () => {
    const bulkOnly = data(
      [
        ["U1", "1", "5V"],
        ["U1", "2", "GND"],
        ["C1", "1", "5V"],
        ["C1", "2", "GND"],
      ],
      { C1: { Value: "47uF" } },
    );
    const r1 = runEmcAudit(bulkOnly);
    expect(findingsOf(r1, "EMC-S011")).toHaveLength(1);
    expect(findingsOf(r1, "EMC-S011")[0].severity).toBe("info");

    const withHf = data(
      [
        ["U1", "1", "5V"],
        ["U1", "2", "GND"],
        ["C1", "1", "5V"],
        ["C1", "2", "GND"],
        ["C2", "1", "5V"],
        ["C2", "2", "GND"],
      ],
      { C1: { Value: "47uF" }, C2: { Value: "100nF" } },
    );
    const r2 = runEmcAudit(withHf);
    expect(findingsOf(r2, "EMC-S011")).toHaveLength(0);
    expect(passedOf(r2, "EMC-S011")).toBeTruthy();
  });
});

describe("emc_audit S020: ground bridging", () => {
  it("flags multiple ground nets without a bridge", () => {
    const d = data([
      ["U1", "1", "PGND"],
      ["U2", "1", "SGND"],
    ]);
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S020");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("info");
    expect(f[0].evidence.ground_nets).toEqual(["PGND", "SGND"]);
  });

  it("passes with a ferrite-bead bridge", () => {
    const d = data([
      ["U1", "1", "PGND"],
      ["U2", "1", "SGND"],
      ["FB1", "1", "PGND"],
      ["FB1", "2", "SGND"],
    ]);
    const r = runEmcAudit(d);
    expect(passedOf(r, "EMC-S020")).toBeTruthy();
  });

  it("passes with a Y-cap bridge between split grounds", () => {
    const d = data([
      ["U1", "1", "PGND"],
      ["U2", "1", "SGND"],
      ["C9", "1", "PGND"],
      ["C9", "2", "SGND"],
    ]);
    const r = runEmcAudit(d);
    expect(passedOf(r, "EMC-S020")).toBeTruthy();
  });

  it("skips when there is only one ground net", () => {
    const d = data([
      ["U1", "1", "GND"],
      ["U1", "2", "3V3"],
    ]);
    const r = runEmcAudit(d);
    expect(r.notes.some((n) => n.includes("EMC-S020"))).toBe(true);
  });
});

describe("emc_audit S030: snubbers", () => {
  it("flags a bare transformer winding pair", () => {
    const d = data([
      ["T1", "1", "K1"],
      ["T1", "2", "SW1"],
      ["U1", "3", "SW1"],
    ]);
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S030");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("info");
    expect(f[0].evidence.designator).toBe("T1");
  });

  it("accepts an R-C series snubber across the winding", () => {
    const d = data([
      ["T1", "1", "K1"],
      ["T1", "2", "SW1"],
      ["R1", "1", "SW1"],
      ["R1", "2", "N1"],
      ["C1", "1", "N1"],
      ["C1", "2", "K1"],
    ]);
    const r = runEmcAudit(d);
    expect(passedOf(r, "EMC-S030")).toBeTruthy();
  });

  it("accepts a diode clamp directly across the winding", () => {
    const d = data([
      ["T1", "1", "K1"],
      ["T1", "2", "SW1"],
      ["D1", "1", "SW1"],
      ["D1", "2", "K1"],
    ]);
    const r = runEmcAudit(d);
    expect(passedOf(r, "EMC-S030")).toBeTruthy();
  });

  it("ignores CM chokes and ferrite beads", () => {
    const d = data([
      ["FL1", "1", "L"],
      ["FL1", "2", "N"],
      ["FB1", "1", "5V"],
      ["FB1", "2", "5VA"],
    ]);
    const r = runEmcAudit(d);
    expect(r.notes.some((n) => n.includes("EMC-S030"))).toBe(true);
  });
});

describe("emc_audit S031: gate series resistor", () => {
  const gatePins: AuditPin[] = [
    { designator: "Q1", pinDesignator: "1", pinName: "G", x: 0, y: 0, isHidden: false },
  ];

  it("flags a gate net with no resistor on it", () => {
    const d = data(
      [
        ["Q1", "1", "GT1"],
        ["U1", "5", "GT1"],
        ["Q1", "2", "K1"],
      ],
      { Q1: { Description: "NMOS" } },
      gatePins,
    );
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S031");
    expect(f).toHaveLength(1);
    expect(f[0].evidence.net).toBe("GT1");
  });

  it("passes when the gate net carries a resistor", () => {
    const d = data(
      [
        ["Q1", "1", "GT1"],
        ["R1", "1", "GT1"],
        ["R1", "2", "GTDRV"],
        ["U1", "5", "GTDRV"],
      ],
      { Q1: { Description: "NMOS" } },
      gatePins,
    );
    const r = runEmcAudit(d);
    expect(passedOf(r, "EMC-S031")).toBeTruthy();
  });
});

describe("emc_audit S032: crystal load caps", () => {
  it("warns when a crystal has no load caps", () => {
    const d = data([
      ["X1", "1", "OSC_IN"],
      ["X1", "2", "OSC_OUT"],
      ["U1", "1", "OSC_IN"],
      ["U1", "2", "OSC_OUT"],
    ]);
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S032");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("warning");
  });

  it("passes with pF caps on both sides and flags 0.1uF as suspicious", () => {
    const ok = data(
      [
        ["X1", "1", "OSC_IN"],
        ["X1", "2", "OSC_OUT"],
        ["C1", "1", "OSC_IN"],
        ["C1", "2", "GND"],
        ["C2", "1", "OSC_OUT"],
        ["C2", "2", "GND"],
      ],
      { C1: { Value: "22pF" }, C2: { Value: "22pF" } },
    );
    const r1 = runEmcAudit(ok);
    expect(findingsOf(r1, "EMC-S032")).toHaveLength(0);
    expect(passedOf(r1, "EMC-S032")).toBeTruthy();

    const bad = data(
      [
        ["X1", "1", "OSC_IN"],
        ["X1", "2", "OSC_OUT"],
        ["C1", "1", "OSC_IN"],
        ["C1", "2", "GND"],
        ["C2", "1", "OSC_OUT"],
        ["C2", "2", "GND"],
      ],
      { C1: { Value: "0.1uF" }, C2: { Value: "22pF" } },
    );
    const r2 = runEmcAudit(bad);
    const f = findingsOf(r2, "EMC-S032");
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain("疑似");
  });
});

describe("emc_audit S040: connector ESD", () => {
  it("flags a connector signal net reaching an IC without protection", () => {
    const d = data([
      ["J1", "1", "SIG1"],
      ["U1", "5", "SIG1"],
      ["U1", "1", "3V3"],
      ["U1", "2", "GND"],
    ]);
    const r = runEmcAudit(d);
    const f = findingsOf(r, "EMC-S040");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("info");
  });

  it("passes with a TVS diode to ground on the net", () => {
    const d = data([
      ["J1", "1", "SIG1"],
      ["U1", "5", "SIG1"],
      ["D1", "1", "SIG1"],
      ["D1", "2", "GND"],
    ]);
    const r = runEmcAudit(d);
    expect(passedOf(r, "EMC-S040")).toBeTruthy();
  });

  it("ignores power/ground connector pins", () => {
    const d = data([
      ["J1", "1", "GND"],
      ["J1", "2", "5V"],
      ["U1", "1", "5V"],
      ["U1", "2", "GND"],
    ]);
    const r = runEmcAudit(d);
    expect(r.notes.some((n) => n.includes("EMC-S040"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Report mechanics
// ---------------------------------------------------------------------------

describe("emc_audit: report mechanics", () => {
  it("produces a full report on the flyback reference board", () => {
    const r = runEmcAudit(flybackBase());
    expect(r.tool).toBe("emc_audit");
    expect(r.data_source).toBe("compiled-dm");
    expect(r.sheet_summary.line_nets).toEqual(["L", "N"]);
    expect(r.sheet_summary.pe_net).toBe("PE");
    expect(r.sheet_summary.ground_nets).toEqual(expect.arrayContaining(["K1", "SGND"]));
    expect(r.sheet_summary.rail_nets).toEqual(["5V"]);
    expect(r.summary.rules_evaluated).toBeGreaterThan(0);
    expect(r.summary.rules_triggered).toBeGreaterThanOrEqual(1); // T1 snubber missing
    expect(findingsOf(r, "EMC-S030")).toHaveLength(1);
    expect(passedOf(r, "EMC-S001")).toBeTruthy();
    expect(passedOf(r, "EMC-S002")).toBeTruthy();
    expect(passedOf(r, "EMC-S004")).toBeTruthy();
  });

  it("filters by category", () => {
    const r = runEmcAudit(flybackBase(), { categories: ["conducted"] });
    expect(r.findings.every((f) => f.category === "conducted")).toBe(true);
    expect(r.findings).toHaveLength(0); // conducted side of the reference board is complete
    expect(passedOf(r, "EMC-S001")).toBeTruthy();
    expect(passedOf(r, "EMC-S030")).toBeUndefined();
  });

  it("filters by min severity", () => {
    const r = runEmcAudit(flybackBase(), { minSeverity: "warning" });
    expect(r.findings.every((f) => f.severity === "warning" || f.severity === "error")).toBe(true);
    expect(r.findings).toHaveLength(0); // reference board only has info-level findings
  });

  it("includes the rule catalog on demand", () => {
    const r = runEmcAudit(flybackBase(), { includeRuleCatalog: true });
    expect(r.rule_catalog).toHaveLength(EMC_RULE_CATALOG.length);
    expect(r.rule_catalog!.every((m) => m.rule_id.startsWith("EMC-S"))).toBe(true);
  });

  it("downgrades trust and notes compile requirement in geometry-fallback mode", () => {
    const d = flybackBase();
    d.dmAvailable = false;
    const r = runEmcAudit(d);
    expect(r.data_source).toBe("geometry-fallback");
    expect(r.notes.some((n) => n.includes("compile_project"))).toBe(true);
  });

  it("sorts findings by severity then rule id", () => {
    const d = data([
      ["J1", "3", "PE"],
      ["U1", "1", "3V3"],
      ["U1", "2", "SGND"],
      ["U2", "1", "PGND"],
      ["X1", "1", "OSC_IN"],
      ["X1", "2", "OSC_OUT"],
    ]);
    const r = runEmcAudit(d);
    const sevOrder = r.findings.map((f) => f.severity);
    const rank = { error: 0, warning: 1, info: 2 } as const;
    const ranks = sevOrder.map((s) => rank[s]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
});
