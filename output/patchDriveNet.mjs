// patchDriveNet.mjs — Sheet3 增量：补 DRIVE 网（R1.2→Q1.2）+ 重审
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runWirePins } from "../dist/tools/wirePins.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet3.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

const r = await runWirePins(bridge, { ...sheet, net_name: "DRIVE", pins: ["R1.2", "Q1.2"], verify: true });
console.log(`DRIVE wires=${r.wires_drawn} ok=${r.ok} one_net=${r.verification?.all_pins_on_one_net}`);

const audit = (await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 })).result ?? {};
const byNet = new Map();
for (const row of audit.pin_nets ?? []) {
  if (row.unconnected) continue;
  const l = byNet.get(row.net) ?? [];
  l.push(`${row.designator}.${row.pin}`);
  byNet.set(row.net, l);
}
console.log("compiled nets:");
for (const [n, l] of [...byNet.entries()].sort()) console.log(`  ${n}: ${[...l].sort().join(", ")}`);
const golden = [
  ["Q1.1"], ["R1.1"], ["R1.2", "Q1.2"], ["Q1.3", "L1.1", "D1.1"],
  ["L1.2", "C1.1", "C2.1", "R2.1", "J1.1"], ["R2.2", "R3.1"],
  ["D1.3", "C1.2", "C2.2", "R3.2", "J1.2"],
];
const goldenSets = new Set(golden.map((g) => [...g].sort().join(" | ")));
const actualSets = new Set([...byNet.values()].map((l) => [...l].sort().join(" | ")));
const pass = actualSets.size === goldenSets.size && [...goldenSets].every((s) => actualSets.has(s));
console.log(`partition vs golden: ${pass ? "IDENTICAL — PASS" : "MISMATCH — FAIL"}`);
console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
for (const e of audit.errors ?? []) console.log("  ERR", e.code, String(e.message).slice(0, 100));
for (const w of audit.warnings ?? []) console.log("  WARN", w.code, String(w.message).slice(0, 100));
console.log(pass ? "RESULT: SUCCESS" : "RESULT: FAILED");
