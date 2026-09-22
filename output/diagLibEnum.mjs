// diagLibEnum.mjs — 修复工程焦点后重测库枚举 + 严格覆盖回溯
import { AltiumBridge } from "../dist/bridge/altiumBridge.js";
import { fetchLibraryComponents, buildPinTable } from "../dist/tools/pinTable.js";
import { validateNetlist } from "../dist/tools/validateNetlist.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: "E:\\workspace\\DSH\\altium-mcp\\altium-scripts",
  timeoutMs: 300_000,
});
const PRJ = "C:\\Users\\Lenovo\\Desktop\\PCB_Project\\PCB_Project.PrjPcb";

const open = await bridge.executeCommand("open_document", { document_kind: "PRJPCB", file_path: PRJ }, { timeoutMs: 120000 });
console.log("open project:", open.success);

const fetched = await fetchLibraryComponents(bridge);
console.log("fetch ok:", fetched.ok, "count:", fetched.ok ? fetched.components.length : fetched.error);
if (!fetched.ok || fetched.components.length === 0) process.exit(1);

const refs = ["NPN", "Res1", "Inductor", "Cap", "Header 2", "Diode 18TQ045"];
const { matched, unmatched } = buildPinTable(fetched.components, refs);
console.log("matched:", matched.map((m) => m.lib_reference).join(", "), "| unmatched:", unmatched.join(", ") || "(none)");
const tables = new Map(matched.map((m) => [m.lib_reference.toLowerCase(), m]));

// 回溯：漏 DRIVE 网的 Sheet3 网表必须被拦
const BUG = {
  components: refs.slice(0, 6).map((r, i) => ({ designator: ["Q1","R1","L1","D1","C1","J1"][i], lib_reference: r })),
  nets: [
    { name: "PWM", pins: ["R1.1"] },
    { name: "SW", pins: ["Q1.3", "L1.1", "D1.1"] },
  ],
};
const r = validateNetlist(BUG, tables);
console.log("\nmissing-net netlist -> ok:", r.ok, "mode:", r.mode);
for (const e of r.errors) console.log("  ERR", e.code, "-", e.message.slice(0, 120));
process.exit(r.ok ? 1 : 0);
