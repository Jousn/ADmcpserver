// smokeStage6.mjs — 阶段6：真实工程下的权威验证 + optimize_layout
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runOptimizeLayout } from "../dist/tools/optimizeLayout.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET };

const GOLDEN = [
  { name: "VCC", pins: ["J1.1", "C1.1", "R1.1", "R3.1"] },
  { name: "GND", pins: ["J1.2", "C1.2", "D1.2", "SW1.2", "D2.2"] },
  { name: "LED1", pins: ["R1.2", "D1.1"] },
  { name: "KEY", pins: ["R3.2", "SW1.1", "R2.1"] },
  { name: "LED2", pins: ["R2.2", "D2.1"] },
];

// 1. 打开真实工程（Free Documents 的 DM_Compile 返回 0 物理文档）
console.log("== open real project ==");
const op = await bridge.executeCommand("open_document", { document_kind: "PRJPCB", file_path: PRJ }, { timeoutMs: 240_000 });
console.log("open_document:", op.success ? "ok" : op.error);

async function connAudit(tag) {
  const res = await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 });
  const audit = res.result ?? {};
  const byNet = new Map();
  for (const row of audit.pin_nets ?? []) {
    if (row.unconnected) continue;
    const list = byNet.get(row.net) ?? [];
    list.push(`${row.designator}.${row.pin}`);
    byNet.set(row.net, list);
  }
  console.log(`\n== ${tag}: compiled nets (${byNet.size}) ==`);
  for (const [n, l] of byNet) console.log(`  ${n}: ${[...l].sort().join(", ")}`);
  const actualSets = new Set([...byNet.values()].map((l) => [...l].sort().join(" | ")));
  const goldenSets = new Set(GOLDEN.map((n) => [...n.pins].sort().join(" | ")));
  const pass = actualSets.size === goldenSets.size && [...goldenSets].every((s) => actualSets.has(s));
  console.log(`${tag} partition vs golden: ${pass ? "IDENTICAL" : "MISMATCH"}`);
  if (!pass) {
    for (const s of goldenSets) if (!actualSets.has(s)) console.log(`  missing: ${s}`);
    for (const s of actualSets) if (!goldenSets.has(s)) console.log(`  extra:   ${s}`);
  }
  console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
  for (const e of audit.errors ?? []) console.log(`  ERR ${e.code}: ${String(e.message).slice(0, 140)}`);
  for (const w of audit.warnings ?? []) console.log(`  WARN ${w.code}: ${String(w.message).slice(0, 140)}`);
  return { pass, byNet };
}

// 2. 权威验证 T7
const before = await connAudit("T7-after-wire_pins");

// 3. optimize_layout T8（爬山 + 全图重布 + 等价验证）
if (before.pass) {
  console.log("\n== T8: optimize_layout ==");
  const t0 = Date.now();
  const r = await runOptimizeLayout(bridge, { ...sheet, max_sweeps: 12, apply: true, verify: true });
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("ok:", r.ok, " applied:", r.applied);
  console.log("estimated_score:", JSON.stringify(r.estimated_score), ` sweeps=${r.sweeps_used} converged=${r.converged}`);
  console.log("transforms:", (r.transforms_planned ?? []).map((t) => `${t.designator}->(${t.to.x},${t.to.y},${t.to.rotation}deg)`).join(" "));
  console.log("wires_drawn:", r.wires_drawn, " junctions_drawn:", r.junctions_drawn);
  const v = r.verification ?? {};
  console.log("netlist_partition_identical:", v.netlist_partition_identical);
  console.log("audit_summary:", JSON.stringify(v.audit_summary));
  for (const e of v.audit_errors ?? []) console.log(`  ERR ${e.code}: ${String(e.message).slice(0, 140)}`);
  console.log("estimated_score_now:", v.estimated_score_now, " crossings:", v.actual_wires_now?.crossings, " bends:", v.actual_wires_now?.total_bends);
  if (r.error) console.log("ERROR:", r.error);

  // 4. 终态再验一次
  await connAudit("final");
}
