// smokeStage9.mjs — 阶段9：收尾（清旧标签/重放GND端口/复核/截图）
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action} failed: ${res.error}`);
  return res.result?.details ?? {};
}

// 1. 清掉重布线后位置失效的旧网络标签与电源端口
const labels = (await bridge.executeCommand("get_schematic_data", { ...sheet, include_queries: ["net_labels", "power_ports"] }, { timeoutMs: 240_000 })).result ?? {};
console.log("stale net_labels:", (labels.net_labels ?? []).map((l) => `${l.text}@(${l.x_mils},${l.y_mils})`).join(" "));
console.log("power_ports:", (labels.power_ports ?? []).map((p) => `${p.text}@(${p.x_mils},${p.y_mils})`).join(" "));
if ((labels.net_labels ?? []).length) await edit({ action: "delete_object", object_type: "net_label", delete_all: true });
if ((labels.power_ports ?? []).length) await edit({ action: "delete_object", object_type: "power_port", delete_all: true });

// 2. 在新的 GND / VCC 引脚热点上重放端口（吸附）
const d2 = await edit({ action: "get_component_info", designator: "D2" });
const gndPin = (d2.pins ?? []).find((p) => p.designator === "2");
const j1 = await edit({ action: "get_component_info", designator: "J1" });
const vccPin = (j1.pins ?? []).find((p) => p.designator === "1");
const pg = await edit({ action: "place_gnd", x_mils: gndPin.x_mils + 4, y_mils: gndPin.y_mils - 3 });
const pv = await edit({ action: "place_vcc", x_mils: vccPin.x_mils + 4, y_mils: vccPin.y_mils + 3 });
console.log(`GND port -> (${pg.x_mils},${pg.y_mils}) snapped_to=${pg.snapped_to}`);
console.log(`VCC port -> (${pv.x_mils},${pv.y_mils}) snapped_to=${pv.snapped_to}`);

// 3. 终审
const audit = (await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 })).result ?? {};
const byNet = new Map();
for (const row of audit.pin_nets ?? []) {
  if (row.unconnected) continue;
  const l = byNet.get(row.net) ?? [];
  l.push(`${row.designator}.${row.pin}`);
  byNet.set(row.net, l);
}
console.log("\nfinal compiled nets:");
for (const [n, l] of byNet) console.log(`  ${n}: ${[...l].sort().join(", ")}`);
console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
for (const e of audit.errors ?? []) console.log(`  ERR ${e.code}`);
for (const w of audit.warnings ?? []) console.log(`  WARN ${w.code}`);

// 4. 截图（聚焦原理图视图）
const shot = await bridge.executeCommand("take_view_screenshot", { view_type: "sch" }, { timeoutMs: 240_000 });
console.log("\nscreenshot:", JSON.stringify(shot.result ?? shot.error));
