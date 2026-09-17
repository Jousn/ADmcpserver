// diagSheet2.mjs — 诊断 Sheet2 buck 模块：引脚朝向 + 标号重叠
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet2.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action}: ${res.error}`);
  return res.result?.details ?? {};
}
const data = (await bridge.executeCommand(
  "get_schematic_data",
  { ...sheet, include_queries: ["components", "wires", "net_labels", "power_ports", "junctions"] },
  { timeoutMs: 240_000 },
)).result ?? {};

const comps = (data.components ?? []).filter((c) => c.designator);
console.log("== components ==");
const boxes = {};
for (const c of comps) {
  const x = c.schematic_x, y = c.schematic_y;
  const w = Math.abs(c.schematic_width ?? 0), h = Math.abs(c.schematic_height ?? 0);
  boxes[c.designator] = { x, y, w, h, rot: c.schematic_rotation ?? 0 };
  console.log(`${c.designator} ${String(c.parameters?.Comment ?? "?").padEnd(16)} origin=(${x},${y}) wh=(${w},${h}) rot=${c.schematic_rotation ?? 0}`);
}

console.log("\n== pin hotspots (每元件引脚自由端坐标 -> 判朝向) ==");
const pins = {};
for (const c of comps) {
  const info = await edit({ action: "get_component_info", designator: c.designator });
  pins[c.designator] = (info.pins ?? []).map((p) => ({ n: p.designator, x: p.x_mils, y: p.y_mils }));
  console.log(`${c.designator}: ` + pins[c.designator].map((p) => `${p.n}@(${p.x},${p.y})`).join(" "));
}

console.log("\n== labels / ports ==");
const texts = [
  ...(data.net_labels ?? []).map((l) => ({ kind: "label", text: l.text, x: l.x_mils, y: l.y_mils })),
  ...(data.power_ports ?? []).map((l) => ({ kind: "port", text: l.text, x: l.x_mils, y: l.y_mils })),
];
for (const t of texts) console.log(`${t.kind.padEnd(5)} "${t.text}" @ (${t.x},${t.y})`);

console.log("\n== wires ==");
for (const w of data.wires ?? []) {
  const v = (w.vertices_mils ?? []).map((p) => `(${p.x_mils},${p.y_mils})`);
  console.log("  " + v.join(" -> "));
}

// ---- 重叠计算 ----
// 标签尺寸估计：文本宽 ≈ 80mil/字符，高 ≈ 100mil（网络标签/端口文本）
const textSize = (s) => ({ w: 80 * String(s).length, h: 100 });
const overlap = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

console.log("\n== overlaps (label/label, label/component-box) ==");
const rects = [];
for (const t of texts) rects.push({ ...textSize(t.text), x: t.x, y: t.y, name: `${t.kind}:${t.text}` });
// 元件禁入区 = 实测引脚热点 ∪ 原点 凸包（B30：导出包围盒对旋转符号不可信）
for (const d in boxes) {
  const b = boxes[d];
  const xs = pins[d].map((p) => p.x).concat([b.x]);
  const ys = pins[d].map((p) => p.y).concat([b.y]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
  rects.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, name: `comp:${d}` });
}
let any = false;
for (let i = 0; i < rects.length; i++) {
  for (let j = i + 1; j < rects.length; j++) {
    if (overlap(rects[i], rects[j])) {
      // 元件凸包之间重叠是符号本体（正常），只报文本相关
      if (rects[i].name.startsWith("comp") && rects[j].name.startsWith("comp")) continue;
      any = true;
      console.log(`  OVERLAP ${rects[i].name} <-> ${rects[j].name}`);
    }
  }
}
if (!any) console.log("  PASS: 全部标签/端口与元件凸包零重叠（凸包口径）");
