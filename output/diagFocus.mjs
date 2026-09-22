// diagFocus.mjs — 判定工程状态：图纸读写 vs 工程打开 vs 库枚举
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});
const SHEET2 = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet2.SchDoc";
const SHEET3 = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet3.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";

for (const [name, sheet] of [["Sheet2", SHEET2], ["Sheet3", SHEET3]]) {
  const r = await bridge.executeCommand(
    "get_schematic_data",
    { schematic_full_path: sheet, project_full_path: PRJ, include_queries: ["components"] },
    { timeoutMs: 120000 },
  );
  const n = (r.result?.components ?? []).filter((c) => c.designator).length;
  console.log(`${name}: success=${r.success} components=${n} ${r.success ? "" : String(r.error).slice(0, 80)}`);
}

// 打开 Sheet2 试试恢复焦点
const open2 = await bridge.executeCommand("open_document", { document_kind: "SCH", file_path: SHEET2 }, { timeoutMs: 120000 });
console.log("open Sheet2:", open2.success);

const lib = await bridge.executeCommand("get_library_symbol_reference", {}, { timeoutMs: 240000 });
console.log("lib enum after:", lib.success, "count:", (lib.result?.components ?? []).length);
process.exit(0);
