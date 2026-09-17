// smokeStage1.mjs — 冒烟测试阶段1：ping + 工作区发现
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});

async function cmd(command, params = {}, timeoutMs = 240_000) {
  const t0 = Date.now();
  const res = await bridge.executeCommand(command, params, { timeoutMs });
  console.log(`[${command}] ${(Date.now() - t0 / 1) / 1000 > 1e6 ? "" : ""}${((Date.now() - t0) / 1000).toFixed(1)}s ->`, JSON.stringify(res.success ? (res.result ?? {}) : res, null, 1).slice(0, 3000));
  return res;
}

console.log("== T1: ping ==");
const ping = await cmd("ping");
if (!ping.success) {
  console.error("BRIDGE DOWN:", ping.error);
  process.exit(1);
}

console.log("\n== T2: list_workspace ==");
const ws = await cmd("list_workspace");
const r = ws.result ?? {};
console.log("focusedProject:", r.focusedProjectFullPath ?? "(none)");
for (const p of r.projects ?? []) {
  console.log(`project[${p.index}] ${p.projectFileName}`);
  for (const d of p.documents ?? []) {
    console.log(`   ${d.kind.padEnd(8)} ${d.fileName}`);
  }
}
