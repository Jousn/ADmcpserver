// smokeStage3.mjs — 阶段3：新代码加载探测 + 引脚坐标读取
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { schematic_full_path: SHEET, ...params }, { timeoutMs: 240_000 });
  return res;
}

// T3: draw_plan 无内容 — 新代码返回 DRAW_PLAN_EMPTY，旧代码返回 UNKNOWN_ACTION（零副作用探测）
console.log("== T3: new-code probe (draw_plan empty) ==");
const probe = await edit({ action: "draw_plan" });
console.log(JSON.stringify(probe.success ? probe.result : probe, null, 1).slice(0, 600));

// T4: 引脚坐标（吸附测试与 wire_pins 的输入基准）
for (const des of ["R1", "J1"]) {
  const info = await edit({ action: "get_component_info", designator: des });
  const d = info.result?.details ?? {};
  console.log(`\n== T4: ${des} (${d.lib_reference}) @(${d.location_x_mils},${d.location_y_mils}) ori=${d.orientation}`);
  for (const p of d.pins ?? []) {
    console.log(`   pin ${p.designator} "${p.name}" (${p.x_mils},${p.y_mils}) len=${p.pin_length_mils} ori=${p.orientation_deg} hidden=${p.is_hidden}`);
  }
}
