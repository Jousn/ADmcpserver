// smokeStage4.mjs — 阶段4：吸附功能实测
// T5: add_wire 端点故意偏移 → 应吸附到 R1.1(1100,200) / R1.2(1500,200)
// T6: place_gnd 位置偏移 → 应吸附到 R1.1
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";

const SHEET = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\Sheet1.SchDoc";
const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});

async function edit(params) {
  const res = await bridge.executeCommand("schematic_edit", { schematic_full_path: SHEET, ...params }, { timeoutMs: 240_000 });
  if (!res.success) throw new Error(`${params.action} failed: ${res.error}`);
  return res.result?.details ?? {};
}

console.log("== T5: add_wire with +8mil offset endpoints (expect snap to R1.1 / R1.2) ==");
// 端点偏移：1108,205 (真实 1100,200) 和 1492,193 (真实 1500,200)；中间拐点 1300,150
const w = await edit({
  action: "add_wire",
  wire_points_csv: "1108,205,1300,150,1492,193",
});
console.log("segments:", w.segments, " snap_tolerance:", w.snap_tolerance_mils);
console.log("points_csv:", w.points_csv);
console.log("snapped:", JSON.stringify(w.snapped));
const okT5 =
  w.points_csv?.startsWith("1100,200") === true &&
  w.points_csv?.endsWith("1500,200") === true &&
  w.snapped?.some((s) => s.target === "R1.1") === true &&
  w.snapped?.some((s) => s.target === "R1.2") === true;
console.log("T5", okT5 ? "PASS" : "FAIL");

console.log("\n== T5 cleanup: delete test wire ==");
const del = await edit({ action: "delete_object", object_type: "wire", x_mils: 1300, y_mils: 150 });
console.log("deleted_count:", del.deleted_count, "(expect >= 1)");

console.log("\n== T6: place_gnd at (1105,208) — near R1.1 (1100,200), expect snap ==");
const g = await edit({ action: "place_gnd", x_mils: 1105, y_mils: 208 });
console.log(`placed GND at (${g.x_mils},${g.y_mils}) snapped_to=${g.snapped_to ?? "(none)"}`);
console.log("T6", g.snapped_to === "R1.1" && g.x_mils === 1100 && g.y_mils === 200 ? "PASS" : "FAIL");

console.log("\n== T6 cleanup: delete test port ==");
const delPort = await edit({ action: "delete_object", object_type: "power_port", x_mils: 1100, y_mils: 200 });
console.log("deleted_count:", delPort.deleted_count, "(expect 1)");
