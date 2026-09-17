// verifyRedraw.mjs — 修复解析器后重验重绘结果
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});

const GOLDEN_SETS = new Set(
  [
    ["J1.1", "C1.1", "R1.1", "R3.1"],
    ["J1.2", "C1.2", "D1.2", "SW1.2", "D2.2"],
    ["R1.2", "D1.1"],
    ["R3.2", "SW1.1", "R2.1"],
    ["R2.2", "D2.1"],
  ].map((l) => [...l].sort().join(" | ")),
);

const audit = (await bridge.executeCommand(
  "check_connectivity",
  { schematic_full_path: SHEET, project_full_path: PRJ },
  { timeoutMs: 240_000 },
)).result ?? {};
const byNet = new Map();
for (const row of audit.pin_nets ?? []) {
  if (row.unconnected) continue;
  const l = byNet.get(row.net) ?? [];
  l.push(`${row.designator}.${row.pin}`);
  byNet.set(row.net, l);
}
console.log(`compiled: pin_count=${audit.pin_count} nets=${byNet.size}`);
for (const [n, l] of byNet) console.log(`  ${n}: ${[...l].sort().join(", ")}`);
const actualSets = new Set([...byNet.values()].map((l) => [...l].sort().join(" | ")));
const pass = actualSets.size === GOLDEN_SETS.size && [...GOLDEN_SETS].every((s) => actualSets.has(s));
console.log(`\npartition vs golden: ${pass ? "IDENTICAL — PASS" : "MISMATCH — FAIL"}`);
if (!pass) {
  for (const s of GOLDEN_SETS) if (!actualSets.has(s)) console.log("  missing:", s);
  for (const s of actualSets) if (!GOLDEN_SETS.has(s)) console.log("  extra:  ", s);
}
console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
for (const e of audit.errors ?? []) console.log("  ERR", e.code, String(e.message).slice(0, 130));
for (const w of audit.warnings ?? []) console.log("  WARN", w.code, String(w.message).slice(0, 130));

// 聚焦 + 缩放适配，准备目视验证
await bridge.executeCommand("open_document", { document_kind: "SCH", file_path: SHEET }, { timeoutMs: 240_000 });
await bridge.executeCommand("zoom_view", { zoom_action: "fit" }, { timeoutMs: 240_000 });
console.log("\nsheet focused + zoom fit done");
