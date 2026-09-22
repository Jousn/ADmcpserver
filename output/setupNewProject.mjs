// setupNewProject.mjs — 新工程接入：SchLib 入工程 → 枚举验证 → 严格覆盖实机回溯
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { fetchLibraryComponents, buildPinTable } from "../dist/tools/pinTable.js";
import { validateNetlist } from "../dist/tools/validateNetlist.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 600_000,
});
const PRJ = "C:\\Users\\Public\\Documents\\Altium\\Projects\\PCB_Project\\PCB_Project.PrjPcb";
const DIR = "C:\\Users\\Public\\Documents\\Altium\\Projects\\PCB_Project";

// 1. 开工程 + 两个 SchLib 入工程
const open = await bridge.executeCommand("open_document", { document_kind: "PRJPCB", file_path: PRJ }, { timeoutMs: 120000 });
console.log("open project:", open.success);
for (const lib of ["Miscellaneous Devices\\Miscellaneous Devices.SchLib", "Miscellaneous Connectors\\Miscellaneous Connectors.SchLib"]) {
  const r = await bridge.executeCommand("add_document_to_project", { project_full_path: PRJ, file_path: `${DIR}\\${lib}` }, { timeoutMs: 120000 });
  console.log(`add ${lib.split("\\")[1]}:`, r.success, JSON.stringify(r.result ?? {}).slice(0, 120));
}

// 2. 库枚举验证
const fetched = await fetchLibraryComponents(bridge);
console.log("lib enum:", fetched.ok ? fetched.components.length : fetched.error);
const refs = ["NPN", "Res1", "Inductor", "Cap", "Header 2", "Diode 18TQ045"];
const { matched, unmatched } = buildPinTable(fetched.ok ? fetched.components : [], refs);
console.log("matched:", matched.map((m) => m.lib_reference).join(", "), "| unmatched:", unmatched.join(", ") || "(none)");
if (!fetched.ok || matched.length === 0) process.exit(1);
const tables = new Map(matched.map((m) => [m.lib_reference.toLowerCase(), m]));

// 3. 严格覆盖实机回溯：漏 DRIVE 网必须被拦，补上后必须通过
const BUG = {
  components: [
    { designator: "Q1", lib_reference: "NPN" },
    { designator: "R1", lib_reference: "Res1" },
  ],
  nets: [{ name: "PWM", pins: ["R1.1"] }],
};
const r1 = validateNetlist(BUG, tables);
console.log("\n[regress] missing DRIVE net -> ok:", r1.ok, "mode:", r1.mode);
for (const e of r1.errors) console.log("   ERR", e.code, "-", e.message.slice(0, 110));
const r2 = validateNetlist({ ...BUG, nets: [...BUG.nets, { name: "DRIVE", pins: ["R1.2", "Q1.2"] }], no_connect: ["Q1.1", "Q1.3"] }, tables);
console.log("[regress] with DRIVE + NC -> ok:", r2.ok, "errors:", r2.errors.length, "no_connect:", r2.pin_coverage.no_connect_pins);
process.exit(r1.ok === false && r2.ok === true ? 0 : 1);
