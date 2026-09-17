// pingBridge.mjs — 直连桥接 ping 测试（长超时）
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "C:\\Users\\Lenovo\\Desktop\\DSH\\altium-mcp\\altium-scripts",
  workspaceRoot: "C:\\Users\\Lenovo\\.altium-mcp\\workspace",
});

const t0 = Date.now();
try {
  const res = await bridge.executeCommand("ping");
  console.log("elapsed:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  console.log(JSON.stringify(res, null, 1));
} catch (e) {
  console.log("elapsed:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  console.error("FAILED:", e.message ?? e);
  process.exit(1);
}
