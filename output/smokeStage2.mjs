// smokeStage2.mjs — 阶段2：两张候选 sheet 的现状
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});

for (const sheet of [
  "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc",
  "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB1.SchDoc",
]) {
  const res = await bridge.executeCommand(
    "get_schematic_data",
    { schematic_full_path: sheet, include_queries: ["components", "wires", "power_ports", "junctions"] },
    { timeoutMs: 240_000 },
  );
  if (!res.success) {
    console.log(sheet, "-> ERROR:", res.error);
    continue;
  }
  const r = res.result ?? {};
  const comps = r.components ?? [];
  console.log(`\n=== ${sheet.split("\\").pop()} ===`);
  console.log(`components=${comps.length} wires=${(r.wires ?? []).length} ports=${(r.power_ports ?? []).length} junctions=${(r.junctions ?? []).length}`);
  for (const c of comps.slice(0, 15)) {
    console.log(`  ${c.designator} ${c.lib_reference ?? "?"} @(${c.schematic_x},${c.schematic_y}) rot=${c.schematic_rotation}`);
  }
}
