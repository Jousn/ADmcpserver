// ping2.mjs — 桥接健康检查（B29 修复后）
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 120_000,
});
const t0 = Date.now();
try {
  const res = await bridge.executeCommand("ping", {}, { timeoutMs: 100_000 });
  console.log("elapsed:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  console.log(JSON.stringify(res, null, 1));
} catch (e) {
  console.log("elapsed:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  console.error("FAILED:", e.message ?? e);
  process.exit(1);
}
