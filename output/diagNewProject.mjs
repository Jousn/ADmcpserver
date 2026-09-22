// diagNewProject.mjs — 新工程接入诊断：开工程 → 图纸内容 → 库枚举
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});
const PRJ = "C:\\Users\\Public\\Documents\\Altium\\Projects\\PCB_Project\\PCB_Project.PrjPcb";
const DIR = "C:\\Users\\Public\\Documents\\Altium\\Projects\\PCB_Project";

const ping = await bridge.executeCommand("ping", {}, { timeoutMs: 60000 });
console.log("ping:", ping.success ? "ok" : "DOWN");

const open = await bridge.executeCommand("open_document", { document_kind: "PRJPCB", file_path: PRJ }, { timeoutMs: 120000 });
console.log("open project:", open.success, String(open.error ?? "").split("\n")[0].slice(0, 100));

for (const s of ["Sheet1", "Sheet2", "Sheet3"]) {
  const r = await bridge.executeCommand(
    "get_schematic_data",
    { schematic_full_path: `${DIR}\\${s}.SchDoc`, project_full_path: PRJ, include_queries: ["components"] },
    { timeoutMs: 120000 },
  );
  const comps = (r.result?.components ?? []).filter((c) => c.designator).map((c) => c.designator);
  console.log(`${s}: ${r.success ? "ok" : "FAIL"} components=[${comps.join(",")}] ${r.success ? "" : String(r.error).split("\n")[0].slice(0, 60)}`);
}

const lib = await bridge.executeCommand("get_library_symbol_reference", {}, { timeoutMs: 240000 });
console.log("lib enum:", lib.success, "count:", (lib.result?.components ?? []).length);
process.exit(0);
