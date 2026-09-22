// regressStrictCoverage.mjs — 回溯验证：Sheet3 漏 DRIVE 网的网表，严格覆盖模式必须拦截
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { validateNetlist } from "../dist/tools/validateNetlist.js";
import { buildPinTable, fetchLibraryComponents } from "../dist/tools/pinTable.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});

// Sheet3 当时的真实场景：BOM 9 元件，网表漏了 DRIVE（R1.2/Q1.2 无归属）
const NETLIST_BUG = {
  components: [
    { designator: "Q1", lib_reference: "NPN" },
    { designator: "R1", lib_reference: "Res1" },
    { designator: "L1", lib_reference: "Inductor" },
    { designator: "D1", lib_reference: "Diode 18TQ045" },
    { designator: "C1", lib_reference: "Cap" },
    { designator: "C2", lib_reference: "Cap" },
    { designator: "R2", lib_reference: "Res1" },
    { designator: "R3", lib_reference: "Res1" },
    { designator: "J1", lib_reference: "Header 2" },
  ],
  nets: [
    { name: "VIN", pins: ["Q1.1"] },
    { name: "PWM", pins: ["R1.1"] },
    { name: "SW", pins: ["Q1.3", "L1.1", "D1.1"] },
    { name: "VOUT", pins: ["L1.2", "C1.1", "C2.1", "R2.1", "J1.1"] },
    { name: "GND", pins: ["D1.3", "C1.2", "C2.2", "R3.2", "J1.2"] },
    { name: "FB", pins: ["R2.2", "R3.1"] },
  ],
};

const fetched = await fetchLibraryComponents(bridge);
const refs = [...new Set(NETLIST_BUG.components.map((c) => c.lib_reference))];
const { matched } = buildPinTable(fetched.ok ? fetched.components : [], refs);
const tables = new Map(matched.map((m) => [m.lib_reference.toLowerCase(), m]));

const r1 = validateNetlist(NETLIST_BUG, tables);
console.log("== 漏 DRIVE 网的网表（当时放行的场景）==");
console.log("ok:", r1.ok);
for (const e of r1.errors) console.log("  ERR", e.code, "-", e.message.slice(0, 130));

console.log("\n== 补上 DRIVE 网后 ==");
const r2 = validateNetlist({ ...NETLIST_BUG, nets: [...NETLIST_BUG.nets, { name: "DRIVE", pins: ["R1.2", "Q1.2"] }] }, tables);
console.log("ok:", r2.ok, " errors:", r2.errors.length, " no_connect_pins:", r2.pin_coverage.no_connect_pins);
process.exit(r1.ok === false && r2.ok === true ? 0 : 1);
