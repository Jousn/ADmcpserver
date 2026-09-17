// diagPins.mjs — GND/KEY 合并网络根因：查 R2/SW1 等引脚实际坐标
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});

for (const des of ["J1", "R1", "C1", "D1", "R3", "SW1", "R2", "D2"]) {
  const r = await bridge.executeCommand(
    "schematic_edit",
    { action: "get_component_info", designator: des, schematic_full_path: SHEET },
    { timeoutMs: 240_000 },
  );
  const d = r.result?.details ?? {};
  console.log(
    des.padEnd(4),
    `@(${d.location_x_mils},${d.location_y_mils})`,
    (d.pins ?? []).map((p) => `${p.designator}@(${p.x_mils},${p.y_mils})`).join(" "),
  );
}
