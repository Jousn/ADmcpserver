// smokeStage8.mjs — 阶段8：修复布局碰撞后完整重测
// 1. 挪开 R2（与 SW1 引脚热点重叠）→ 2. wire_pins 重连 GND/KEY → 3. 网表比对 → 4. T8 optimize_layout
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runWirePins } from "../dist/tools/wirePins.js";
import { runOptimizeLayout } from "../dist/tools/optimizeLayout.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const sheet = { schematic_full_path: SHEET, project_full_path: PRJ };

const GOLDEN = [
  { name: "VCC", pins: ["J1.1", "C1.1", "R1.1", "R3.1"] },
  { name: "GND", pins: ["J1.2", "C1.2", "D1.2", "SW1.2", "D2.2"] },
  { name: "LED1", pins: ["R1.2", "D1.1"] },
  { name: "KEY", pins: ["R3.2", "SW1.1", "R2.1"] },
  { name: "LED2", pins: ["R2.2", "D2.1"] },
];
const GOLDEN_SETS = new Set(GOLDEN.map((n) => [...n.pins].sort().join(" | ")));

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { ...sheet, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action} failed: ${res.error}`);
  return res.result?.details ?? {};
}

// 1. 挪开 R2：x +300（远离 SW1.2 的 (2500,500)）
console.log("== fix placement: move R2 clear of SW1 pin overlap ==");
const mv = await edit({ action: "set_component_transform", designator: "R2", x_mils: 2900, y_mils: 600 });
console.log("R2 ->", JSON.stringify(mv));
const info = await edit({ action: "get_component_info", designator: "R2" });
console.log("R2 pins now:", (info.pins ?? []).map((p) => `${p.designator}@(${p.x_mils},${p.y_mils})`).join(" "));

// 2. 清空全部导线与 junction（电源端口保留在引脚上）
await edit({ action: "delete_object", object_type: "wire", delete_all: true });
await edit({ action: "delete_object", object_type: "junction", delete_all: true });
console.log("wires + junctions cleared (power ports kept)");

// 3. wire_pins 重连 5 网
let allOk = true;
for (const net of GOLDEN) {
  const r = await runWirePins(bridge, { ...sheet, net_name: net.name, pins: net.pins, verify: true });
  const v = r.verification ?? {};
  const ok = r.ok === true && v.all_pins_on_one_net === true;
  allOk = allOk && ok;
  console.log(
    `[${net.name.padEnd(4)}] wires=${r.wires_drawn} junctions=${r.junctions_drawn} one_net=${v.all_pins_on_one_net} ` +
    `net="${v.actual_net_name ?? ""}" floating=[${(v.still_floating ?? []).join(",")}] ${ok ? "OK" : "FAIL: " + (r.error ?? "")}`,
  );
}

// 4. 网表权威比对
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
  const pass = actualSets.size === GOLDEN_SETS.size && [...GOLDEN_SETS].every((s) => actualSets.has(s));
  console.log(`${tag}: ${pass ? "IDENTICAL — T7 PASS" : "MISMATCH — T7 FAIL"}`);
  if (!pass) {
    for (const s of GOLDEN_SETS) if (!actualSets.has(s)) console.log(`  missing: ${s}`);
    for (const s of actualSets) if (!GOLDEN_SETS.has(s)) console.log(`  extra:   ${s}`);
  }
  console.log(`errors=${(audit.errors ?? []).length} warnings=${(audit.warnings ?? []).length}`);
  for (const e of audit.errors ?? []) console.log(`  ERR ${e.code}: ${String(e.message).slice(0, 130)}`);
  for (const w of audit.warnings ?? []) console.log(`  WARN ${w.code}: ${String(w.message).slice(0, 130)}`);
  return pass;
}

const t7 = await connAudit("T7");

// 5. T8 optimize_layout
if (t7) {
  console.log("\n== T8: optimize_layout ==");
  const t0 = Date.now();
  const r = await runOptimizeLayout(bridge, { ...sheet, max_sweeps: 12, apply: true, verify: true });
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("ok:", r.ok, "applied:", r.applied, `sweeps=${r.sweeps_used} converged=${r.converged}`);
  console.log("score:", JSON.stringify(r.estimated_score));
  console.log("transforms:", (r.transforms_planned ?? []).map((t) => `${t.designator}->(${t.to.x},${t.to.y},${t.to.rotation}deg)`).join(" "));
  console.log("wires_drawn:", r.wires_drawn, "junctions_drawn:", r.junctions_drawn);
  const v = r.verification ?? {};
  console.log("netlist_partition_identical:", v.netlist_partition_identical);
  console.log("audit_summary:", JSON.stringify(v.audit_summary));
  for (const e of v.audit_errors ?? []) console.log(`  ERR ${e.code}: ${String(e.message).slice(0, 130)}`);
  console.log("score_now:", v.estimated_score_now, "crossings:", v.actual_wires_now?.crossings, "bends:", v.actual_wires_now?.total_bends, "len:", v.actual_wires_now?.total_length_mils);
  if (r.error) console.log("ERROR:", r.error);
  await connAudit("final");
}
