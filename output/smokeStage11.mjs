// smokeStage11.mjs — P0 实机验证：一键实例化 Buck 输入级模板
// 前置：AD 正常运行 + PCB_Project 已打开（含两个 SchLib）
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runListModuleTemplates } from "../dist/tools/instantiateModule.js";
import { runInstantiateModule } from "../dist/tools/instantiateModule.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet2.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});

// 0. 环境自检
const ping = await bridge.executeCommand("ping", {}, { timeoutMs: 240_000 });
if (!ping.success) {
  console.error("AD bridge DOWN:", ping.error, "— 请先重启 AD 并打开 PCB_Project");
  process.exit(1);
}
console.log("bridge: ok");

// 0.5 确保工程已打开（AD 重启后 Projects 面板可能是空的；幂等）
const open = await bridge.executeCommand("open_document", {
  document_kind: "PRJPCB",
  file_path: PRJ,
}, { timeoutMs: 240_000 });
console.log("open_document:", JSON.stringify(open).slice(0, 200));

// 1. 模板清单
const list = await runListModuleTemplates();
console.log("\n== list_module_templates ==");
console.log(JSON.stringify(list, null, 1).slice(0, 600));

// 2. 一键实例化（LED 电路右侧空位，避开现有内容）
console.log("\n== instantiate_module(buck-input-stage @ (5500,1500)) ==");
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
console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log("ok:", r.ok, " error:", r.error ?? "-");
if (r.stage) console.log("stage:", r.stage);
if (r.issues) for (const i of r.issues) console.log("  issue:", i.code, "-", i.message);
for (const c of r.components_placed ?? []) {
  console.log(`  ${c.slot.padEnd(7)} ${c.designator.padEnd(4)} @(${c.x},${c.y}) rot=${c.rotation}`);
}
for (const n of r.nets ?? []) {
  console.log(`  net ${String(n.net).padEnd(8)} pins=[${n.pins.join(", ")}] wires=${n.wires_drawn} ok=${n.ok}`);
}
console.log("values_set:", r.values_set, " params:", JSON.stringify(r.params_used));
console.log("verification:", JSON.stringify(r.verification ?? {}, null, 1).slice(0, 800));
