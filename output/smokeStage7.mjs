// smokeStage7.mjs — 阶段7：修复后的 open_document(PRJPCB) → 编译层验证 → optimize_layout
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runOptimizeLayout } from "../dist/tools/optimizeLayout.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

const GOLDEN_SETS = new Set(
  [
    ["J1.1", "C1.1", "R1.1", "R3.1"],
    ["J1.2", "C1.2", "D1.2", "SW1.2", "D2.2"],
    ["R1.2", "D1.1"],
    ["R3.2", "SW1.1", "R2.1"],
    ["R2.2", "D2.1"],
  ].map((l) => [...l].sort().join(" | ")),
);

// 1. 用修复后的 open_document 打开工程
console.log("== open project (fixed DM_OpenProject path) ==");
const op = await bridge.executeCommand("open_document", { document_kind: "PRJPCB", file_path: PRJ }, { timeoutMs: 240_000 });
console.log(op.success ? JSON.stringify(op.result) : "FAILED: " + op.error);

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
  console.log(`\n== ${tag}: compiled nets (${byNet.size}), pin_count=${audit.pin_count} ==`);
  for (const [n, l] of byNet) console.log(`  ${n}: ${[...l].sort().join(", ")}`);
  const actualSets = new Set([...byNet.values()].map((l) => [...l].sort().join(" | ")));
  const pass = actualSets.size === GOLDEN_SETS.size && [...GOLDEN_SETS].every((s) => actualSets.has(s));
  console.log(`${tag}: partition vs golden ${pass ? "IDENTICAL — PASS" : "MISMATCH — FAIL"}`);
  if (!pass) {
    for (const s of GOLDEN_SETS) if (!actualSets.has(s)) console.log(`  missing: ${s}`);
    for (const s of actualSets) if (!GOLDEN_SETS.has(s)) console.log(`  extra:   ${s}`);
  }
  console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
  for (const e of audit.errors ?? []) console.log(`  ERR ${e.code}: ${String(e.message).slice(0, 140)}`);
  for (const w of audit.warnings ?? []) console.log(`  WARN ${w.code}: ${String(w.message).slice(0, 140)}`);
  return pass;
}

// 2. T7 权威验证
const t7 = await connAudit("T7-after-wire_pins");

// 3. T8 optimize_layout
if (t7) {
  console.log("\n== T8: optimize_layout ==");
  const t0 = Date.now();
  const r = await runOptimizeLayout(bridge, { ...sheet, max_sweeps: 12, apply: true, verify: true });
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("ok:", r.ok, "applied:", r.applied);
  console.log("estimated_score:", JSON.stringify(r.estimated_score), `sweeps=${r.sweeps_used} converged=${r.converged}`);
  console.log("transforms:", (r.transforms_planned ?? []).map((t) => `${t.designator}->(${t.to.x},${t.to.y},${t.to.rotation}deg)`).join(" "));
  console.log("wires_drawn:", r.wires_drawn, "junctions_drawn:", r.junctions_drawn);
  const v = r.verification ?? {};
  console.log("netlist_partition_identical:", v.netlist_partition_identical);
  console.log("audit_summary:", JSON.stringify(v.audit_summary));
  for (const e of v.audit_errors ?? []) console.log(`  ERR ${e.code}: ${String(e.message).slice(0, 140)}`);
  console.log("score_now:", v.estimated_score_now, "crossings:", v.actual_wires_now?.crossings, "bends:", v.actual_wires_now?.total_bends, "len:", v.actual_wires_now?.total_length_mils);
  if (r.error) console.log("ERROR:", r.error);

  // 4. 终态人工复核
  await connAudit("final");
}
