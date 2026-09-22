// diagBridgeState.mjs — 桥接/工程状态诊断
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});
const ping = await bridge.executeCommand("ping", {}, { timeoutMs: 60000 });
console.log("ping:", ping.success ? "ok" : "DOWN");

const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const open = await bridge.executeCommand("open_document", { document_kind: "PRJPCB", file_path: PRJ }, { timeoutMs: 120000 });
console.log("open:", open.success, String(open.error ?? "").slice(0, 150));

const lib = await bridge.executeCommand("get_library_symbol_reference", {}, { timeoutMs: 240000 });
console.log("lib enum:", lib.success, "count:", (lib.result?.components ?? []).length, String(lib.error ?? "").slice(0, 120));
process.exit(0);
