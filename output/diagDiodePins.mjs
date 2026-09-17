// diagDiodePins.mjs — 查 Diode 18TQ045 引脚号/名/朝向（确定 A/K 对应哪个数字）
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});

const { runPinTable } = await import("../dist/tools/pinTable.js");
const res = await runPinTable(bridge, {
  lib_references: ["Diode 18TQ045"],
});
console.log(JSON.stringify(res, null, 1));
