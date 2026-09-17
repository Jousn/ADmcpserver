// redrawSheet1.mjs — 用新流水线重绘 Sheet1（解决"拥挤在下方"）
// 布局设计（模型只做粗粒度规划，几何全部交给工具）：
//   双轨制：VCC 顶轨 y≈1900 / GND 底部 y≈300-600，信号行 y≈1500（引脚线）
//   左→右：J1(电源入口) → C1(去耦,竖) → R1→D1(LED1 指示支路,横)
//          → R3(竖,上拉)→SW1(横,按键) → R2(竖)→D2(竖,LED2,阴极朝下)
//   元件间距 ≥500 mil，键控支路在右侧独立下坠
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

// ---- 0. 快照（可回滚） ----
const snap = await getData(["wires", "power_ports", "junctions", "net_labels"]);
writeFileSync("output/sheet1-snapshot-preredraw.json", JSON.stringify(snap, null, 1));
console.log(`snapshot: ${(snap.wires ?? []).length} wires / ${(snap.power_ports ?? []).length} ports / ${(snap.net_labels ?? []).length} labels`);

// ---- 1. 新布局（粗粒度：位号, x, y, 旋转） ----
const LAYOUT = [
  { des: "J1", x: 700, y: 1600, rot: 0 },   // 电源入口，最左，引脚朝左
  { des: "C1", x: 1200, y: 1100, rot: 270 }, // 去耦电容，竖直跨在两轨之间
  { des: "R1", x: 1800, y: 1600, rot: 0 },   // LED1 限流，横
  { des: "D1", x: 2600, y: 1600, rot: 0 },   // LED1，横（A 左 K 右）
  { des: "R3", x: 3400, y: 1600, rot: 90 },  // KEY 上拉，竖（顶=VCC 底=KEY）
  { des: "SW1", x: 3800, y: 1600, rot: 0 },  // 按键，横
  { des: "R2", x: 4500, y: 1100, rot: 90 },  // LED2 限流，竖
  { des: "D2", x: 4600, y: 600, rot: 270 },  // LED2，竖（A 上 K 下）
];

// ---- 2. 一次 draw_plan：全部变换 + 清空旧线 ----
const t1 = await edit({
  action: "draw_plan",
  transforms_csv: LAYOUT.map((c) => `${c.des};${c.x};${c.y};${c.rot}`),
  delete_wires_all: true,
});
console.log("draw_plan: transforms_applied =", t1.transforms_applied, " wires_deleted_all =", t1.wires_deleted_all);

// 旧网络标签 / 电源端口也清掉（重布后位置全部失效）
for (const t of ["net_label", "power_port"]) {
  const r = await edit({ action: "delete_object", object_type: t, delete_all: true });
  console.log(`cleared ${t}`);
}

// ---- 3. 回读新引脚坐标（人工确认布局合理） ----
for (const c of LAYOUT) {
  const info = await edit({ action: "get_component_info", designator: c.des });
  console.log(
    c.des.padEnd(4),
    (info.pins ?? []).map((p) => `${p.designator}@(${p.x_mils},${p.y_mils})`).join(" "),
  );
}

// ---- 4. wire_pins 逐网布线 ----
const netWires = {};
for (const net of GOLDEN) {
  const r = await runWirePins(bridge, { ...sheet, net_name: net.name, pins: net.pins, verify: true });
  const v = r.verification ?? {};
  netWires[net.name] = r.wires ?? [];
  console.log(
    `[${net.name.padEnd(4)}] wires=${r.wires_drawn} junctions=${r.junctions_drawn} one_net=${v.all_pins_on_one_net} ` +
    `floating=[${(v.still_floating ?? []).join(",")}] ${r.ok ? "OK" : "FAIL " + (r.error ?? "")}`,
  );
}

// ---- 5. 电源端口（吸附）+ 网络标签（落在真实导线顶点上） ----
const pinPos = {};
for (const c of LAYOUT) {
  const info = await edit({ action: "get_component_info", designator: c.des });
  for (const p of info.pins ?? []) pinPos[`${c.des}.${p.designator}`] = { x: p.x_mils, y: p.y_mils };
}
const pv = await edit({ action: "place_vcc", x_mils: pinPos["J1.1"].x, y_mils: pinPos["J1.1"].y });
console.log(`VCC port -> (${pv.x_mils},${pv.y_mils}) snapped=${pv.snapped_to}`);
const pg1 = await edit({ action: "place_gnd", x_mils: pinPos["J1.2"].x, y_mils: pinPos["J1.2"].y });
const pg2 = await edit({ action: "place_gnd", x_mils: pinPos["D2.2"].x, y_mils: pinPos["D2.2"].y });
console.log(`GND ports -> (${pg1.x_mils},${pg1.y_mils}) / (${pg2.x_mils},${pg2.y_mils})`);

for (const net of ["LED1", "KEY", "LED2"]) {
  const wires = netWires[net] ?? [];
  if (wires.length === 0) continue;
  // 取最长导线的中点（曼哈顿段中点必在线上）
  const w = wires.reduce((a, b) => (b.length >= a.length ? b : a));
  const mid = w.length === 2
    ? [Math.round((w[0][0] + w[1][0]) / 2 / 100) * 100, Math.round((w[0][1] + w[1][1]) / 2 / 100) * 100]
    : w[Math.floor(w.length / 2)];
  const r = await edit({ action: "add_net_label", net_name: net, x_mils: mid[0], y_mils: mid[1] });
  console.log(`label ${net} @ (${r.x_mils},${r.y_mils})`);
}

// ---- 6. 终审：分区比对黄金网表 ----
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
