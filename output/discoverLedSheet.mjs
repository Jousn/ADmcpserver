// discoverLedSheet.mjs — 桥接直连：ping + 列出工作区项目/打开的文档
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "C:\\Users\\Lenovo\\Desktop\\DSH\\altium-mcp\\altium-scripts",
});

const t0 = Date.now();
try {
  const res = await bridge.executeCommand("get_workspace_projects", {}, { timeoutMs: 300_000 });
  console.log("elapsed:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  console.log(JSON.stringify(res, null, 1));
} catch (e) {
  console.log("elapsed:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  console.error("FAILED:", e.message ?? e);
  process.exit(1);
}
