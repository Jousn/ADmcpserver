// redrawFromScratch.mjs — Sheet1 完全清空后按"首次绘制"状态从零重画
// 流水线：读原件(lib+值) → 删除全部对象 → 重新放置 → set Value → wire_pins 布线
//         → 电源端口(吸附) → 网络标签 → check_connectivity 分区比对黄金网表
import { writeFileSync } from "node:fs";
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runWirePins } from "../dist/tools/wirePins.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

const GOLDEN = [
  { name: "VCC", pins: ["J1.1", "C1.1", "R1.1", "R3.1"] },
  { name: "GND", pins: ["J1.2", "C1.2", "D1.2", "SW1.2", "D2.2"] },
  { name: "LED1", pins: ["R1.2", "D1.1"] },
  { name: "KEY", pins: ["R3.2", "SW1.1", "R2.1"] },
  { name: "LED2", pins: ["R2.2", "D2.1"] },
];

// 双轨布局（VCC 顶轨 / GND 底轨，信号行居中；上次重绘已目视验证）
const LAYOUT = [
  { des: "J1", x: 700, y: 1600, rot: 0 },    // 电源入口
  { des: "C1", x: 1200, y: 1100, rot: 270 }, // 去耦电容
  { des: "R1", x: 1800, y: 1600, rot: 0 },   // LED1 限流
  { des: "D1", x: 2600, y: 1600, rot: 0 },   // LED1
  { des: "R3", x: 3400, y: 1600, rot: 90 },  // KEY 上拉
  { des: "SW1", x: 3800, y: 1600, rot: 0 },  // 按键
  { des: "R2", x: 4500, y: 1100, rot: 90 },  // LED2 限流
  { des: "D2", x: 4600, y: 600, rot: 270 },  // LED2
];

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action} failed: ${res.error}`);
  return res.result?.details ?? {};
}
async function getData(queries) {
  const res = await bridge.executeCommand("get_schematic_data", { ...sheet, include_queries: queries }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`get_schematic_data: ${res.error}`);
  return res.result ?? {};
}
function valueOf(parameters) {
  if (!parameters) return "";
  if (Array.isArray(parameters)) {
    const hit = parameters.find((p) => String(p.name ?? "").toLowerCase() === "value");
    return hit ? String(hit.value ?? "") : "";
  }
  for (const [k, v] of Object.entries(parameters)) {
    if (k.toLowerCase() === "value") return String(v ?? "");
  }
  return "";
}

// ---- 0. ping ----
const ping = await bridge.executeCommand("ping", {}, { timeoutMs: 120_000 });
if (!ping.success) { console.error("bridge DOWN:", ping.error); process.exit(1); }
console.log("bridge: ok");

// ---- 1. 读现有元件（lib_reference + Value）——删除前唯一快照 ----
const data0 = await getData(["components", "wires", "power_ports", "net_labels", "junctions"]);
writeFileSync("output/sheet1-snapshot-before-wipe.json", JSON.stringify(data0, null, 1));
const comps = (data0.components ?? []).filter((c) => typeof c.designator === "string" && c.designator !== "");
console.log(`before wipe: ${comps.length} components, ${(data0.wires ?? []).length} wires, ${(data0.power_ports ?? []).length} ports, ${(data0.net_labels ?? []).length} labels`);
if (comps.length > 0) console.log("first raw comp:", JSON.stringify(comps[0]).slice(0, 400));

const libOf = {};   // designator -> lib_reference
const valueOf_ = {}; // designator -> Value
for (const c of comps) libOf[c.designator] = String(c.lib_reference ?? "");
for (const c of comps) {
  const info = await edit({ action: "get_component_info", designator: c.designator });
  valueOf_[c.designator] = valueOf(info.parameters);
}
console.log("captured:", comps.map((c) => `${c.designator}=${libOf[c.designator] || "?"}(V=${valueOf_[c.designator] || "-"})`).join(" "));

// ---- 2. 清空：先线类对象，再元件 ----
for (const t of ["wire", "junction", "net_label", "power_port", "text"]) {
  await edit({ action: "delete_object", object_type: t, delete_all: true });
}
console.log("cleared wires/junctions/labels/ports/texts");
for (const c of comps) {
  await edit({ action: "delete_object", object_type: "component", designator: c.designator });
}
const dataEmpty = await getData(["components"]);
const remaining = (dataEmpty.components ?? []).filter((c) => c.designator);
console.log(`after wipe: ${remaining.length} components remain`);
if (remaining.length > 0) { console.error("WIPE INCOMPLETE:", remaining.map((c) => c.designator)); process.exit(1); }

// ---- 3. 重新放置 8 元件 ----
for (const c of LAYOUT) {
  const lib = libOf[c.des];
  if (!lib) { console.error(`no lib_reference captured for ${c.des}`); process.exit(1); }
  const r = await edit({ action: "place_component", lib_reference: lib, designator: c.des, x_mils: c.x, y_mils: c.y, rotation_deg: c.rot });
  console.log(`placed ${c.des} (${lib}) @(${c.x},${c.y}) rot=${c.rot} -> (${r.x_mils ?? "?"},${r.y_mils ?? "?"})`);
}

// ---- 4. 恢复 Value 参数 ----
let valuesSet = 0;
for (const c of LAYOUT) {
  const v = valueOf_[c.des];
  if (!v) continue;
  await edit({ action: "set_component_parameters", designator: c.des, parameter_names: ["Value"], parameter_values: [v] });
  valuesSet += 1;
}
console.log(`values restored: ${valuesSet}`);

// ---- 5. wire_pins 逐网布线（拓扑进，几何全部工具侧） ----
const netWires = {};
let wiringOk = true;
for (const net of GOLDEN) {
  const r = await runWirePins(bridge, { ...sheet, net_name: net.name, pins: net.pins, verify: true });
  const v = r.verification ?? {};
  netWires[net.name] = r.wires ?? [];
  if (!r.ok) wiringOk = false;
  console.log(`[${net.name.padEnd(4)}] wires=${r.wires_drawn} junctions=${r.junctions_drawn} one_net=${v.all_pins_on_one_net} floating=[${(v.still_floating ?? []).join(",")}] ${r.ok ? "OK" : "FAIL " + (r.error ?? "")}`);
}

// ---- 6. 电源端口（吸附到引脚热点）+ 网络标签（落真实顶点） ----
const pinPos = {};
for (const c of LAYOUT) {
  const info = await edit({ action: "get_component_info", designator: c.des });
  for (const p of info.pins ?? []) pinPos[`${c.des}.${p.designator}`] = { x: p.x_mils, y: p.y_mils };
}
const pv = await edit({ action: "place_vcc", x_mils: pinPos["J1.1"].x, y_mils: pinPos["J1.1"].y });
console.log(`VCC port -> (${pv.x_mils},${pv.y_mils}) snapped=${pv.snapped_to ?? "-"}`);
const pg1 = await edit({ action: "place_gnd", x_mils: pinPos["J1.2"].x, y_mils: pinPos["J1.2"].y });
const pg2 = await edit({ action: "place_gnd", x_mils: pinPos["D2.2"].x, y_mils: pinPos["D2.2"].y });
console.log(`GND ports -> (${pg1.x_mils},${pg1.y_mils}) / (${pg2.x_mils},${pg2.y_mils})`);

for (const net of ["LED1", "KEY", "LED2"]) {
  const wires = netWires[net] ?? [];
  if (wires.length === 0) continue;
  const w = wires.reduce((a, b) => (b.length >= a.length ? b : a));
  const mid = w.length === 2
    ? [Math.round((w[0][0] + w[1][0]) / 2 / 100) * 100, Math.round((w[0][1] + w[1][1]) / 2 / 100) * 100]
    : w[Math.floor(w.length / 2)];
  const r = await edit({ action: "add_net_label", net_name: net, x_mils: mid[0], y_mils: mid[1] });
  console.log(`label ${net} @ (${r.x_mils},${r.y_mils})`);
}

// ---- 7. 终审：编译分区 vs 黄金网表 ----
const audit = (await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 })).result ?? {};
const byNet = new Map();
for (const row of audit.pin_nets ?? []) {
  if (row.unconnected) continue;
  const l = byNet.get(row.net) ?? [];
  l.push(`${row.designator}.${row.pin}`);
  byNet.set(row.net, l);
}
console.log("\ncompiled nets:");
for (const [n, l] of byNet) console.log(`  ${n}: ${[...l].sort().join(", ")}`);
const goldenSets = new Set(GOLDEN.map((n) => [...n.pins].sort().join(" | ")));
const actualSets = new Set([...byNet.values()].map((l) => [...l].sort().join(" | ")));
const pass = actualSets.size === goldenSets.size && [...goldenSets].every((s) => actualSets.has(s));
console.log(`\npartition vs golden: ${pass ? "IDENTICAL — PASS" : "MISMATCH — FAIL"}`);
console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
for (const e of audit.errors ?? []) console.log("  ERR", e.code, String(e.message).slice(0, 120));
for (const w of audit.warnings ?? []) console.log("  WARN", w.code, String(w.message).slice(0, 120));
console.log(`\nRESULT: ${pass && wiringOk ? "SUCCESS" : "FAILED"}`);
