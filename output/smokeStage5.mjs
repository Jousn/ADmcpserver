// smokeStage5.mjs — 阶段5：wire_pins 全流程实测
// 清空 Sheet1 的导线/junction/电源端口 → wire_pins 按 5 个黄金网络重连 →
// 重放电源端口（测 place 吸附）→ check_connectivity 比对网表分区
import { writeFileSync } from "node:fs";
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runWirePins } from "../dist/tools/wirePins.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});

const sheet = { schematic_full_path: SHEET };
async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action} failed: ${res.error}`);
  return res.result?.details ?? {};
}
async function getData(queries) {
  const res = await bridge.executeCommand("get_schematic_data", { ...sheet, include_queries: queries }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`get_schematic_data failed: ${res.error}`);
  return res.result ?? {};
}

// 黄金网表（led-indicator-circuit.yaml 冻结版）
const GOLDEN = [
  { name: "VCC", pins: ["J1.1", "C1.1", "R1.1", "R3.1"] },
  { name: "GND", pins: ["J1.2", "C1.2", "D1.2", "SW1.2", "D2.2"] },
  { name: "LED1", pins: ["R1.2", "D1.1"] },
  { name: "KEY", pins: ["R3.2", "SW1.1", "R2.1"] },
  { name: "LED2", pins: ["R2.2", "D2.1"] },
];

// 1. 引脚有效性预检 + 记录各网络代表引脚坐标（供电源端口放置）
const comps = (await getData(["components"])).components ?? [];
console.log(`components on sheet: ${comps.map((c) => c.designator).join(", ")}`);
const pinPos = new Map();
for (const c of comps) {
  const d = await edit({ action: "get_component_info", designator: c.designator });
  for (const p of d.pins ?? []) pinPos.set(`${c.designator}.${p.designator}`, { x: p.x_mils, y: p.y_mils });
}
const missing = GOLDEN.flatMap((n) => n.pins).filter((p) => !pinPos.has(p));
if (missing.length) throw new Error(`golden pins missing on sheet: ${missing.join(", ")}`);
console.log(`all ${pinPos.size} pins resolved; golden nets reference ${GOLDEN.flatMap((n) => n.pins).length} pins`);

// 2. 快照（可恢复）
const snap = await getData(["wires", "power_ports", "junctions"]);
writeFileSync("output/sheet1-snapshot.json", JSON.stringify(snap, null, 1));
console.log(`snapshot: ${(snap.wires ?? []).length} wires, ${(snap.power_ports ?? []).length} ports, ${(snap.junctions ?? []).length} junctions -> output/sheet1-snapshot.json`);

// 3. 清空导线 / junction / 电源端口
await edit({ action: "delete_object", object_type: "wire", delete_all: true });
await edit({ action: "delete_object", object_type: "junction", delete_all: true });
await edit({ action: "delete_object", object_type: "power_port", delete_all: true });
console.log("cleared wires + junctions + power ports");

// 4. wire_pins 逐网重连
for (const net of GOLDEN) {
  const t0 = Date.now();
  const r = await runWirePins(bridge, { ...sheet, net_name: net.name, pins: net.pins, verify: true });
  const v = r.verification ?? {};
  console.log(
    `[${net.name}] ${((Date.now() - t0) / 1000).toFixed(0)}s wires=${r.wires_drawn} junctions=${r.junctions_drawn} ` +
    `one_net=${v.all_pins_on_one_net} net="${v.actual_net_name}" floating=[${(v.still_floating ?? []).join(",")}] ` +
    `audit_errors=${v.audit_errors?.length ?? "?"} ok=${r.ok}`,
  );
  if (r.wires) for (const w of r.wires) console.log(`    wire: ${w.map((p) => p.join(",")).join(" -> ")}`);
}

// 5. 电源端口：VCC 挂 J1.1、GND 挂 D2.2（坐标故意偏 5mil 验证吸附）
const vccPin = pinPos.get("J1.1");
const gndPin = pinPos.get("D2.2");
const pv = await edit({ action: "place_vcc", x_mils: vccPin.x + 5, y_mils: vccPin.y + 3 });
const pg = await edit({ action: "place_gnd", x_mils: gndPin.x - 4, y_mils: gndPin.y + 5 });
console.log(`VCC port -> (${pv.x_mils},${pv.y_mils}) snapped_to=${pv.snapped_to ?? "-"}`);
console.log(`GND port -> (${pg.x_mils},${pg.y_mils}) snapped_to=${pg.snapped_to ?? "-"}`);

// 6. 终审：连通性 + 与黄金网表比对（按引脚成员集合，非网络名）
const auditRes = await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 });
const audit = auditRes.result ?? {};
const byNet = new Map();
for (const row of audit.pin_nets ?? []) {
  if (row.unconnected) continue;
  const list = byNet.get(row.net) ?? [];
  list.push(`${row.designator}.${row.pin}`);
  byNet.set(row.net, list);
}
const actualSets = new Set([...byNet.values()].map((l) => [...l].sort().join(" | ")));
const goldenSets = new Set(GOLDEN.map((n) => [...n.pins].sort().join(" | ")));
console.log(`\ncompiled nets (${byNet.size}):`);
for (const [n, l] of byNet) console.log(`  ${n}: ${[...l].sort().join(", ")}`);
let pass = actualSets.size === goldenSets.size && [...goldenSets].every((s) => actualSets.has(s));
console.log(`\nnetlist partition vs golden: ${pass ? "IDENTICAL — T7 PASS" : "MISMATCH — T7 FAIL"}`);
if (!pass) {
  for (const s of goldenSets) if (!actualSets.has(s)) console.log(`  missing: ${s}`);
  for (const s of actualSets) if (!goldenSets.has(s)) console.log(`  extra:   ${s}`);
}
console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
for (const e of audit.errors ?? []) console.log(`  ERR ${e.code}: ${e.message.slice(0, 120)}`);
