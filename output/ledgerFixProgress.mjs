// ledgerFixProgress.mjs — 补记 VIN/PWM 标签端接网；清除已解决 issue
import { runDesignLedger } from "../dist/tools/designLedger.js";

const SHEET = "C:\\Users\\Public\\Documents\\Altium\\Projects\\PCB_Project\\Sheet3.SchDoc";
const L = runDesignLedger({ action: "load", schematic_full_path: SHEET });
if (!L.ok) { console.error("load failed:", L.error); process.exit(1); }
const S = L.state;
S.progress.nets_wired = [...new Set([...(S.progress.nets_wired ?? []), "VIN", "PWM"])].sort();
S.open_issues = [];
const r = runDesignLedger({ action: "save", schematic_full_path: SHEET, state: S, note: "补记标签端接网 VIN/PWM；旧图迁移 issue 已解决（重画完成）" });
console.log("save:", r.ok);
const st = runDesignLedger({ action: "status", schematic_full_path: SHEET });
console.log("pending:", st.review.pending_placed.length, "place /", st.review.pending_nets.length, "nets");
console.log("warnings:", st.review.warnings.length ? st.review.warnings : "(clean)");
