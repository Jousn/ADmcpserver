// smokeStage10.mjs — 阶段10：pin_table + validate_netlist 实机测试
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { runPinTable } from "../dist/tools/pinTable.js";
import { runValidateNetlist } from "../dist/tools/validateNetlist.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});

// ---- T1: pin_table 查询 LED 指示灯电路的 5 种符号 ----
console.log("== T1: pin_table(Res1, Cap, LED0, SW-PB, Header 2) ==");
const pt = await runPinTable(bridge, { lib_references: ["Res1", "Cap", "LED0", "SW-PB", "Header 2"] });
if (!pt.ok) {
  console.log("FAILED:", pt.error);
} else {
  console.log(`matched=${pt.matched_count}${pt.unmatched ? " unmatched=" + JSON.stringify(pt.unmatched) : ""}`);
  for (const c of pt.components) {
    console.log(`\n${c.lib_reference} (${c.description}, ${c.library_name}):`);
    for (const p of c.pins) {
      console.log(
        `  pin ${String(p.number).padEnd(3)} "${p.name}" ${p.electrical_type.replace("eElectric", "").padEnd(12)} ` +
        `ori=${String(p.orientation_deg).padEnd(3)} loc=(${p.x},${p.y}) len=${p.pin_length_mils} ` +
        `hotspot_offset=(${p.hotspot_dx},${p.hotspot_dy})`,
      );
    }
  }
}

// ---- T2: validate_netlist 验黄金网表（应 PASS 全覆盖）----
console.log("\n== T2: validate_netlist(golden LED indicator netlist) ==");
const GOLDEN = {
  components: [
    { designator: "J1", lib_reference: "Header 2" },
    { designator: "C1", lib_reference: "Cap" },
    { designator: "R1", lib_reference: "Res1" },
    { designator: "D1", lib_reference: "LED0" },
    { designator: "R3", lib_reference: "Res1" },
    { designator: "SW1", lib_reference: "SW-PB" },
    { designator: "R2", lib_reference: "Res1" },
    { designator: "D2", lib_reference: "LED0" },
  ],
  nets: [
    { name: "VCC", pins: ["J1.1", "C1.1", "R1.1", "R3.1"] },
    { name: "GND", pins: ["J1.2", "C1.2", "D1.2", "SW1.2", "D2.2"] },
    { name: "LED1", pins: ["R1.2", "D1.1"] },
    { name: "KEY", pins: ["R3.2", "SW1.1", "R2.1"] },
    { name: "LED2", pins: ["R2.2", "D2.1"] },
  ],
};
const good = await runValidateNetlist(bridge, { ...GOLDEN, check_pin_tables: true });
console.log(`ok=${good.ok} mode=${good.mode} errors=${good.errors?.length} warnings=${good.warnings?.length}`);
console.log("coverage:", JSON.stringify(good.pin_coverage));
for (const w of good.warnings ?? []) console.log("  WARN", w.code, "-", w.message.slice(0, 110));
console.log("T2", good.ok ? "PASS" : "FAIL");

// ---- T3: 故障注入（三个经典 LLM 错误）----
console.log("\n== T3: fault injection ==");
// 3a. 幻觉引脚：D1.9（LED0 只有 2 个引脚）
const a = await runValidateNetlist(bridge, {
  components: [{ designator: "D1", lib_reference: "LED0" }],
  nets: [{ name: "N1", pins: ["D1.1", "D1.9"] }],
  check_pin_tables: true,
});
console.log("3a hallucinated pin D1.9:", a.errors?.map((e) => e.code).join(",") || "(none)", "->", a.ok ? "FAIL" : "PASS");
// 3b. 一个引脚挂两个网络（构造性短路）
const b = await runValidateNetlist(bridge, {
  components: [{ designator: "R1", lib_reference: "Res1" }],
  nets: [
    { name: "A", pins: ["R1.1", "R1.2"] },
    { name: "B", pins: ["R1.2"] },
  ],
  check_pin_tables: true,
});
console.log("3b pin in two nets:", b.errors?.map((e) => e.code).join(",") || "(none)", "->", b.ok ? "FAIL" : "PASS");
// 3c. BOM 里放了元件但网表忘了（全覆盖缺口）
const c = await runValidateNetlist(bridge, {
  components: [
    { designator: "R1", lib_reference: "Res1" },
    { designator: "R9", lib_reference: "Res1" },
  ],
  nets: [{ name: "N1", pins: ["R1.1", "R1.2"] }],
  check_pin_tables: true,
});
const r9 = c.pin_coverage?.unassigned_by_component?.find((u) => u.designator === "R9");
console.log("3c forgotten component R9:", r9 ? `unassigned_pins=${r9.unassigned_pins.join(",")}` : "(not reported)", "->", r9 ? "PASS" : "FAIL");
// 3d. 语法模式（不碰 Altium）
const d = await runValidateNetlist(bridge, {
  components: [{ designator: "R1", lib_reference: "Res1" }],
  nets: [{ name: "A", pins: ["R1"] }],
  check_pin_tables: false,
});
console.log("3d syntax-only malformed pin:", d.errors?.map((e) => e.code).join(",") || "(none)", `mode=${d.mode}`, "->", d.ok ? "FAIL" : "PASS");
