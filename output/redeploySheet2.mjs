// redeploySheet2.mjs — 按修订模板(v2: 引脚朝向+轨道对齐)重部署 Sheet2 buck 模块
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runInstantiateModule } from "../dist/tools/instantiateModule.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet2.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action}: ${res.error}`);
  return res.result?.details ?? {};
}

// ---- 1. 清空 Sheet2 ----
for (const t of ["wire", "junction", "net_label", "power_port", "text"]) {
  await edit({ action: "delete_object", object_type: t, delete_all: true });
}
const data = (await bridge.executeCommand(
  "get_schematic_data",
  { ...sheet, include_queries: ["components"] },
  { timeoutMs: 240_000 },
)).result ?? {};
const comps = (data.components ?? []).filter((c) => c.designator);
for (const c of comps) {
  await edit({ action: "delete_object", object_type: "component", designator: c.designator });
}
console.log(`wiped Sheet2 (${comps.length} components removed)`);

// ---- 2. 新模板实例化（同参数） ----
const t0 = Date.now();
const r = await runInstantiateModule(bridge, {
  template: "buck-input-stage",
  schematic_full_path: SHEET,
  project_full_path: PRJ,
  origin_x_mils: 5500,
  origin_y_mils: 1500,
  params: { c_bulk_uf: 220, r_uv2_k: 33 },
  verify: true,
});
console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s  ok=${r.ok} error=${r.error ?? "-"}`);
for (const c of r.components_placed ?? []) {
  console.log(`  ${c.slot.padEnd(7)} ${c.designator.padEnd(4)} @(${c.x},${c.y}) rot=${c.rotation}`);
}
for (const n of r.nets ?? []) {
  console.log(`  net ${String(n.net).padEnd(8)} pins=[${n.pins.join(", ")}] wires=${n.wires_drawn} ok=${n.ok}`);
}
console.log("verification:", JSON.stringify(r.verification ?? {}).slice(0, 300));
if (!r.ok) process.exit(1);
