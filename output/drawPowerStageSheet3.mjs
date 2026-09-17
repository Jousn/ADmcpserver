// drawPowerStageSheet3.mjs — Buck 功率级 @ Sheet3（STAGE 0-3 全流程验证）
//
// STAGE 0 布局方案（详见对话）：
//   功率行 y=1300: Q1.E(1300)-SW(2000)-L1-VOUT(2600→4800)
//   Q1 rot0(C上E下B左) / L1 rot0 / D1 rot90(K上续流) / C1,C2 rot270 / R2,R3 rot270 / J1 rot0(输出朝左)
// STAGE 1: validate_netlist（真实引脚表）
// STAGE 2: place_component(anchor_pin)——引脚落点语义，9 元件
// STAGE 3: wire_pins ×4 网 + 标签×5 + GND端口 + check_connectivity 分区比对
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runWirePins } from "../dist/tools/wirePins.js";
import { anchoredOrigin, findTemplatePin } from "../dist/tools/moduleTemplates.js";
import { buildPinTable, fetchLibraryComponents } from "../dist/tools/pinTable.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet3.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

// ---- STAGE 1: 设计网表（位号.引脚号，引脚号来自实测 pin_table）----
const NETLIST = {
  components: [
    { designator: "Q1", lib_reference: "NPN" },
    { designator: "R1", lib_reference: "Res1" },   // R_G 基极电阻
    { designator: "L1", lib_reference: "Inductor" },
    { designator: "D1", lib_reference: "Diode 18TQ045" },
    { designator: "C1", lib_reference: "Cap" },    // 输出大容量
    { designator: "C2", lib_reference: "Cap" },    // 输出高频
    { designator: "R2", lib_reference: "Res1" },   // FB 上分压
    { designator: "R3", lib_reference: "Res1" },   // FB 下分压
    { designator: "J1", lib_reference: "Header 2" }, // 输出连接器
  ],
  nets: [
    { name: "VIN", pins: ["Q1.1"] },                        // C，标签入口
    { name: "PWM", pins: ["R1.1"] },                        // 标签入口
    { name: "DRIVE", pins: ["R1.2", "Q1.2"] },              // R_G → 基极（内部网，无端接）
    { name: "SW",  pins: ["Q1.3", "L1.1", "D1.1"] },        // E, L左, K
    { name: "VOUT", pins: ["L1.2", "C1.1", "C2.1", "R2.1", "J1.1"] },
    { name: "FB",  pins: ["R2.2", "R3.1"] },                // 先于 GND：分压中缝短段必须先占列
    { name: "GND", pins: ["D1.3", "C1.2", "C2.2", "R3.2", "J1.2"] },
  ],
};

// ---- STAGE 2: 锚点放置表（anchor_pin + 引脚落点 + 旋转 + 朝向理由）----
// SW 节点拆为母线段：Q1.E(1300) — D1.K(1800,下垂) — L1.1(2200)，避免引脚叠引脚
const PLACE = [
  { des: "Q1", anchor: "1", x: 1300, y: 1900, rot: 0,   why: "C 落 VIN 顶点；rot0=C上/E下/B左" },
  { des: "R1", anchor: "2", x: 900,  y: 1600, rot: 0,   why: "pin2(右)→Q1.B(1000,1600)；PWM 从左进" },
  { des: "D1", anchor: "1", x: 1800, y: 1300, rot: 90,  why: "K 落 SW 段中点（rot90=K上A下，续流）" },
  { des: "L1", anchor: "1", x: 2200, y: 1300, rot: 0,   why: "pin1 落 SW 段右端，水平串功率行" },
  { des: "C1", anchor: "1", x: 3300, y: 1300, rot: 270, why: "pin1 顶=VOUT 轨，跨轨去耦" },
  { des: "C2", anchor: "1", x: 3800, y: 1300, rot: 270, why: "同上" },
  { des: "R2", anchor: "1", x: 4400, y: 1300, rot: 270, why: "FB 上分压，pin1 顶=VOUT" },
  { des: "R3", anchor: "1", x: 4400, y: 600,  rot: 270, why: "FB 下分压，与 R2 头尾相接中缝300" },
  { des: "J1", anchor: "1", x: 5000, y: 1300, rot: 0,   why: "输出连接器 rot0=引脚朝左，pin1 落 VOUT 轨" },
];

const VALUES = { R1: "1K", L1: "10uH", C1: "100uF", C2: "1uF", R2: "100k", R3: "22k" };
// 标签锚点（STAGE 0 已核算净空）：VIN@C热点 PWM@R1.1 SW@段中 VOUT@C2-R2间 FB@中缝
const LABELS = [
  { net: "VIN", x: 1300, y: 1900 },
  { net: "PWM", x: 500, y: 1600 },
  { net: "SW", x: 1550, y: 1300 },
  { net: "VOUT", x: 3950, y: 1300 },
  { net: "FB", x: 4400, y: 750 },
];

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action} failed: ${res.error}`);
  return res.result?.details ?? {};
}

// ---- 0. 前置 ----
const ping = await bridge.executeCommand("ping", {}, { timeoutMs: 120_000 });
if (!ping.success) { console.error("bridge DOWN"); process.exit(1); }
// 清空 Sheet3（上次失败的 Q1 + 残留对象）
const wipe0 = (await bridge.executeCommand("get_schematic_data", { ...sheet, include_queries: ["components"] }, { timeoutMs: 240_000 })).result?.components ?? [];
for (const c of wipe0.filter((c) => c.designator)) {
  await edit({ action: "delete_object", object_type: "component", designator: c.designator });
}
for (const t of ["wire", "junction", "net_label", "power_port", "text"]) {
  await edit({ action: "delete_object", object_type: t, delete_all: true });
}
console.log(`bridge ok; Sheet3 wiped (${wipe0.filter((c) => c.designator).length} stale components removed)`);

// ---- 1. STAGE 1: 网表校验（真实引脚表模式）----
const fetched = await fetchLibraryComponents(bridge);
const refs = [...new Set(NETLIST.components.map((c) => c.lib_reference))];
const { matched } = buildPinTable(fetched.ok ? fetched.components : [], refs);
const tables = new Map(matched.map((m) => [m.lib_reference.toLowerCase(), m]));
const { validateNetlist } = await import("../dist/tools/validateNetlist.js");
const validation = validateNetlist(NETLIST, tables);
console.log("\n== STAGE 1 validate_netlist ==");
console.log("ok:", validation.ok, " errors:", JSON.stringify(validation.errors ?? []));
if (!validation.ok) process.exit(1);

// ---- 2. STAGE 2: 锚点放置（本地解析原点 = instantiateModule 同款纯函数路径；回读验证）----
console.log("\n== STAGE 2 place (anchor-resolved) ==");
const pinPos = {};
for (const p of PLACE) {
  const lib = NETLIST.components.find((c) => c.designator === p.des).lib_reference;
  const pin = findTemplatePin(tables, lib, p.anchor);
  if (!pin) { console.error(`anchor pin ${p.anchor} not found on ${lib}`); process.exit(1); }
  const o = anchoredOrigin(pin, p.rot, { x: p.x, y: p.y });
  await edit({ action: "place_component", lib_reference: lib, designator: p.des, x_mils: Math.round(o.x), y_mils: Math.round(o.y), rotation_deg: p.rot });
  const info = await edit({ action: "get_component_info", designator: p.des });
  for (const q of info.pins ?? []) pinPos[`${p.des}.${q.designator}`] = { x: q.x_mils, y: q.y_mils };
  const actual = pinPos[`${p.des}.${p.anchor}`];
  const err = Math.max(Math.abs(actual.x - p.x), Math.abs(actual.y - p.y));
  console.log(`  ${p.des}(${lib}) anchor ${p.anchor} -> (${actual.x},${actual.y}) target(${p.x},${p.y}) err=${err}mil  [${p.why}]`);
  if (err > 10) { console.error("ANCHOR MISS >10mil"); process.exit(1); }
}

// ---- 3. STAGE 3: 数值 -> 布线 ----
console.log("\n== STAGE 3 wire_pins ==");
const routedNets = NETLIST.nets.filter((n) => n.pins.length >= 2);
for (const net of routedNets) {
  const r = await runWirePins(bridge, { ...sheet, net_name: net.name, pins: net.pins, verify: true });
  const v = r.verification ?? {};
  console.log(`  [${net.name.padEnd(4)}] wires=${r.wires_drawn} junctions=${r.junctions_drawn} one_net=${v.all_pins_on_one_net} ${r.ok ? "OK" : "FAIL " + (r.error ?? "")}`);
  if (!r.ok) process.exit(1);
}

// 数值参数
for (const [des, v] of Object.entries(VALUES)) {
  await edit({ action: "set_component_parameters", designator: des, parameter_names: ["Value"], parameter_values: [v] });
}
console.log(`values set: ${Object.keys(VALUES).length}`);

// 标签（锚点=STAGE 0 核算的净空位）+ GND 端口（挂 D1.3 引脚热点）
for (const l of LABELS) {
  await edit({ action: "add_net_label", net_name: l.net, x_mils: l.x, y_mils: l.y });
}
console.log(`labels: ${LABELS.map((l) => l.net).join(", ")}`);
const gndAt = pinPos["D1.3"];
const gp = await edit({ action: "place_gnd", x_mils: gndAt.x, y_mils: gndAt.y });
console.log(`GND port -> (${gp.x_mils},${gp.y_mils}) snapped=${gp.snapped_to ?? "-"}`);

// ---- 4. 终审：编译分区 vs 设计网表 ----
const audit = (await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 })).result ?? {};
const byNet = new Map();
for (const row of audit.pin_nets ?? []) {
  if (row.unconnected) continue;
  const l = byNet.get(row.net) ?? [];
  l.push(`${row.designator}.${row.pin}`);
  byNet.set(row.net, l);
}
console.log("\n== compiled nets ==");
for (const [n, l] of [...byNet.entries()].sort()) console.log(`  ${n}: ${[...l].sort().join(", ")}`);
const goldenSets = new Set(NETLIST.nets.map((n) => [...n.pins].sort().join(" | ")));
const actualSets = new Set([...byNet.values()].map((l) => [...l].sort().join(" | ")));
const pass = actualSets.size === goldenSets.size && [...goldenSets].every((s) => actualSets.has(s));
console.log(`\npartition vs golden: ${pass ? "IDENTICAL — PASS" : "MISMATCH — FAIL"}`);
console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
for (const e of audit.errors ?? []) console.log("  ERR", e.code, String(e.message).slice(0, 110));
for (const w of audit.warnings ?? []) console.log("  WARN", w.code, String(w.message).slice(0, 110));
console.log(`\nRESULT: ${pass ? "SUCCESS" : "FAILED"}`);
