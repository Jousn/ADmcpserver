// ledgerExercise.mjs — 设计台账实机演练（新工程 Sheet3，功率级）
// 流程：save(完整设计) → load 审查 → 完全从台账数据绘图 → 审计 → save(进度/验证)
// 关键：绘图只读 LEDGER STATE，不引用任何对话记忆中的常量。
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runWirePins } from "../dist/tools/wirePins.js";
import { runDesignLedger } from "../dist/tools/designLedger.js";
import { anchoredOrigin, findTemplatePin } from "../dist/tools/moduleTemplates.js";
import { buildPinTable, fetchLibraryComponents } from "../dist/tools/pinTable.js";

const SHEET = "C:\\Users\\Public\\Documents\\Altium\\Projects\\PCB_Project\\Sheet3.SchDoc";
const PRJ = "C:\\Users\\Public\\Documents\\Altium\\Projects\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

// ============ Phase A: 保存完整设计（规划+冻结网表+放置表+标签） ============
const DESIGN = {
  design_name: "buck-power-stage-v1",
  description: "NPN 高边开关 + 续流 + LC 滤波 + FB 分压 + 输出连接器",
  stage: "placement",
  block_map: [
    { name: "开关级", function: "PWM 驱动高边开关", inputs: ["VIN", "PWM"], outputs: ["SW"], components: ["Q1", "R1", "D1"] },
    { name: "滤波级", function: "LC 滤波 + 输出去耦", inputs: ["SW"], outputs: ["VOUT"], components: ["L1", "C1", "C2"] },
    { name: "反馈级", function: "输出分压采样", inputs: ["VOUT"], outputs: ["FB"], components: ["R2", "R3"] },
    { name: "输出", function: "端子", inputs: ["VOUT"], outputs: [], components: ["J1"] },
  ],
  rail_map: [
    { net_name: "SW", y_mils: 1300, pins: ["Q1.3", "D1.1", "L1.1"] },
    { net_name: "VOUT", y_mils: 1300, pins: ["L1.2", "C1.1", "C2.1", "R2.1", "J1.1"] },
  ],
  placement: [
    { designator: "Q1", lib_reference: "NPN", anchor_pin: "1", x_mils: 1300, y_mils: 1900, rotation_deg: 0, why: "C 上 VIN 顶点；rot0=C上/E下/B左" },
    { designator: "R1", lib_reference: "Res1", anchor_pin: "2", x_mils: 900, y_mils: 1600, rotation_deg: 0, why: "pin2→Q1.B，PWM 左进" },
    { designator: "D1", lib_reference: "Diode 18TQ045", anchor_pin: "1", x_mils: 1800, y_mils: 1300, rotation_deg: 90, why: "K 落 SW 段中点（rot90=K上A下续流）" },
    { designator: "L1", lib_reference: "Inductor", anchor_pin: "1", x_mils: 2200, y_mils: 1300, rotation_deg: 0, why: "pin1 落 SW 段右端，水平串功率行" },
    { designator: "C1", lib_reference: "Cap", anchor_pin: "1", x_mils: 3300, y_mils: 1300, rotation_deg: 270, why: "pin1 顶=VOUT 轨，跨轨去耦" },
    { designator: "C2", lib_reference: "Cap", anchor_pin: "1", x_mils: 3800, y_mils: 1300, rotation_deg: 270, why: "同上" },
    { designator: "R2", lib_reference: "Res1", anchor_pin: "1", x_mils: 4400, y_mils: 1300, rotation_deg: 270, why: "FB 上分压，pin1 顶=VOUT" },
    { designator: "R3", lib_reference: "Res1", anchor_pin: "1", x_mils: 4400, y_mils: 600, rotation_deg: 270, why: "FB 下分压，中缝 300 放 FB 标签" },
    { designator: "J1", lib_reference: "Header 2", anchor_pin: "1", x_mils: 5000, y_mils: 1300, rotation_deg: 0, why: "输出连接器 rot0 引脚朝左" },
  ],
  netlist: {
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
      { name: "DRIVE", pins: ["R1.2", "Q1.2"] },
      { name: "SW", pins: ["Q1.3", "L1.1", "D1.1"] },
      { name: "VOUT", pins: ["L1.2", "C1.1", "C2.1", "R2.1", "J1.1"] },
      { name: "FB", pins: ["R2.2", "R3.1"] },
      { name: "GND", pins: ["D1.3", "C1.2", "C2.2", "R3.2", "J1.2"] },
    ],
    no_connect: [],
  },
  labels: [
    { net: "VIN", x_mils: 1300, y_mils: 1900 },
    { net: "PWM", x_mils: 500, y_mils: 1600 },
    { net: "SW", x_mils: 1550, y_mils: 1300 },
    { net: "VOUT", x_mils: 3950, y_mils: 1300 },
    { net: "FB", x_mils: 4400, y_mils: 750 },
  ],
  ports: [{ net: "GND", pin: "D1.3", style: "gnd" }],
  values: undefined,
  progress: {},
  open_issues: ["Sheet3 新画布，旧工程图未迁移（本图重画）"],
};
const saveA = runDesignLedger({ action: "save", schematic_full_path: SHEET, state: DESIGN, note: "STAGE0+1 完整设计入库" });
console.log("[A] save ok:", saveA.ok, "| review warnings:", saveA.review.warnings.length);
for (const w of saveA.review.warnings) console.log("    W:", w);

// ============ Phase B: 模拟新会话——只从台账恢复 ============
const L = runDesignLedger({ action: "load", schematic_full_path: SHEET });
if (!L.ok) { console.error("load failed:", L.error); process.exit(1); }
const S = L.state; // 绘图唯一数据源
console.log(`[B] load ok: ${S.design_name} stage=${S.stage} | pending_place=${L.review.pending_placed.length} pending_nets=${L.review.pending_nets.length}`);

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action}: ${res.error}`);
  return res.result?.details ?? {};
}

// 清空 Sheet3（若有残留）
const existing = (await bridge.executeCommand("get_schematic_data", { ...sheet, include_queries: ["components"] }, { timeoutMs: 240_000 })).result?.components ?? [];
for (const c of existing.filter((c) => c.designator)) {
  await edit({ action: "delete_object", object_type: "component", designator: c.designator });
}
for (const t of ["wire", "junction", "net_label", "power_port", "text"]) {
  await edit({ action: "delete_object", object_type: t, delete_all: true });
}

// ============ Phase C: 完全按台账放置（锚点） ============
const fetched = await fetchLibraryComponents(bridge);
const refs = [...new Set(S.netlist.components.map((c) => c.lib_reference))];
const { matched } = buildPinTable(fetched.ok ? fetched.components : [], refs);
const tables = new Map(matched.map((m) => [m.lib_reference.toLowerCase(), m]));
console.log("[C] pin tables:", matched.length, "/", refs.length);

const placed = [];
const pinPos = {};
for (const p of S.placement) {
  const pin = findTemplatePin(tables, p.lib_reference, p.anchor_pin);
  if (!pin) { console.error(`anchor ${p.anchor_pin} missing on ${p.lib_reference}`); process.exit(1); }
  const o = anchoredOrigin(pin, p.rotation_deg, { x: p.x_mils, y: p.y_mils });
  await edit({ action: "place_component", lib_reference: p.lib_reference, designator: p.designator, x_mils: Math.round(o.x), y_mils: Math.round(o.y), rotation_deg: p.rotation_deg });
  const info = await edit({ action: "get_component_info", designator: p.designator });
  for (const q of info.pins ?? []) pinPos[`${p.designator}.${q.designator}`] = { x: q.x_mils, y: q.y_mils };
  const a = pinPos[`${p.designator}.${p.anchor_pin}`];
  const err = Math.max(Math.abs(a.x - p.x_mils), Math.abs(a.y - p.y_mils));
  placed.push(p.designator);
  console.log(`    ${p.designator} anchor err=${err}mil`);
  if (err > 10) process.exit(1);
}
for (const [des, v] of Object.entries({ R1: "1K", L1: "10uH", C1: "100uF", C2: "1uF", R2: "100k", R3: "22k" })) {
  await edit({ action: "set_component_parameters", designator: des, parameter_names: ["Value"], parameter_values: [v] });
}

// ============ Phase D: 按台账网表布线（先短后长：DRIVE/FB 先，GND 最后） ============
const wired = [];
const order = ["DRIVE", "FB", "SW", "VOUT", "GND"];
for (const name of order) {
  const net = S.netlist.nets.find((n) => n.name === name);
  const r = await runWirePins(bridge, { ...sheet, net_name: net.name, pins: net.pins, verify: true });
  if (!r.ok) { console.error(`wire ${name} FAIL`, r.error); process.exit(1); }
  wired.push(name);
  console.log(`    [${name}] wires=${r.wires_drawn} OK`);
}
for (const l of S.labels) {
  await edit({ action: "add_net_label", net_name: l.net, x_mils: l.x_mils, y_mils: l.y_mils });
}
for (const p of S.ports) {
  const at = pinPos[p.pin];
  await edit({ action: p.style === "gnd" ? "place_gnd" : "place_vcc", x_mils: at.x, y_mils: at.y });
}
console.log(`    labels: ${S.labels.map((l) => l.net).join(",")} | ports: ${S.ports.map((p) => `${p.style}@${p.pin}`).join(",")}`);

// ============ Phase E: 终审 + 台账回写 ============
const audit = (await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 })).result ?? {};
const byNet = new Map();
for (const row of audit.pin_nets ?? []) {
  if (row.unconnected) continue;
  const l = byNet.get(row.net) ?? [];
  l.push(`${row.designator}.${row.pin}`);
  byNet.set(row.net, l);
}
const goldenSets = new Set(S.netlist.nets.map((n) => [...n.pins].sort().join(" | ")));
const actualSets = new Set([...byNet.values()].map((l) => [...l].sort().join(" | ")));
const pass = actualSets.size === goldenSets.size && [...goldenSets].every((s) => actualSets.has(s));
console.log(`[E] partition vs ledger netlist: ${pass ? "IDENTICAL — PASS" : "MISMATCH"} (errors=${(audit.errors ?? []).length})`);

const saveB = runDesignLedger({
  action: "save",
  schematic_full_path: SHEET,
  state: { ...S, stage: pass ? "verified" : "wiring", progress: { components_placed: placed, nets_wired: wired, verification: { partition_match: pass, errors: (audit.errors ?? []).length } } },
  note: pass ? "绘制完成，分区一致" : "分区不一致，待修",
});
console.log("[E] ledger saved:", saveB.ok, "| stage:", pass ? "verified" : "wiring", "| pending:", saveB.review.pending_placed.length, "place /", saveB.review.pending_nets.length, "nets");
const final = runDesignLedger({ action: "status", schematic_full_path: SHEET });
console.log("[E] final review warnings:", final.review.warnings.length ? final.review.warnings : "(clean)");
process.exit(pass ? 0 : 1);
