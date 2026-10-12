import * as z from "zod/v4";
import type { SchematicAuditData } from "./schematicAuditData.js";

/**
 * emc_audit: DETERMINISTIC schematic-side EMC rule engine (L1 of the EMC×AI plan).
 *
 * Philosophy (same discipline as the rest of altium-mcp): every rule verdict is
 * computed by plain code over compiled-netlist + component-parameter facts.
 * No LLM ever decides a verdict — the LLM only consumes this report and turns
 * findings into remediation advice. Net-name and value parsing heuristics are
 * configurable so companies can adapt recognition to their own conventions.
 *
 * Data required (all from fetchSchematicAuditData): pinNets (compiled DM layer),
 * components + parameters (Value / Description / Comment), pins, ports.
 *
 * Rule families v1 (12 rules):
 *   conducted  S001 CM-choke missing, S002 X-cap missing, S003 X-cap value,
 *              S004 Y-cap missing, S005 Y-cap value
 *   decoupling S010 rail without decoupling caps, S011 rail without HF caps
 *   grounding  S020 multiple ground nets without bridge component
 *   switching  S030 winding without RC/RCD snubber, S031 gate without series R
 *   interface  S032 crystal without load caps, S040 connector signal without ESD
 */

export const emcAuditInputSchema = z.object({
  schematic_full_path: z
    .string()
    .optional()
    .describe("Absolute path to one .SchDoc (same scoping as get_schematic_data)."),
  project_full_path: z.string().optional().describe("Absolute path to an open .PrjPcb."),
  schematic_sheet_file_name: z.string().optional().describe("Sheet file name, e.g. Sheet1.SchDoc."),
  categories: z
    .array(z.enum(["conducted", "decoupling", "grounding", "switching", "interface"]))
    .optional()
    .describe("Rule families to evaluate (default: all)."),
  min_severity: z
    .enum(["error", "warning", "info"])
    .optional()
    .describe("Drop findings below this severity (default: info = keep everything)."),
  include_rule_catalog: z
    .boolean()
    .optional()
    .describe("Also return the full rule catalog with rationale (default false)."),
  thresholds: z
    .object({
      x_cap_max_uf: z.number().positive().optional(),
      y_cap_max_nf: z.number().positive().optional(),
      hf_decoupling_max_uf: z.number().positive().optional(),
    })
    .optional()
    .describe("Override default rule thresholds (X-cap 2.2uF, Y-cap 4.7nF, HF decoupling 0.47uF)."),
});

export type EmcAuditInput = z.infer<typeof emcAuditInputSchema>;

// ---------------------------------------------------------------------------
// Public output shapes
// ---------------------------------------------------------------------------

export type EmcCategory = "conducted" | "decoupling" | "grounding" | "switching" | "interface";
export type EmcSeverity = "error" | "warning" | "info";

export interface EmcFinding {
  rule_id: string;
  category: EmcCategory;
  severity: EmcSeverity;
  message: string;
  evidence: Record<string, unknown>;
  recommendation: string;
}

export interface EmcCheckPassed {
  rule_id: string;
  summary: string;
}

export interface EmcRuleMeta {
  rule_id: string;
  category: EmcCategory;
  default_severity: EmcSeverity;
  title: string;
  checks: string;
  basis: string;
}

export interface EmcAuditReport {
  tool: "emc_audit";
  data_source: "compiled-dm" | "geometry-fallback";
  sheet_summary: {
    components: number;
    nets: number;
    line_nets: string[];
    pe_net: string | null;
    ground_nets: string[];
    rail_nets: string[];
    dm_note: string;
  };
  findings: EmcFinding[];
  checks_passed: EmcCheckPassed[];
  summary: {
    rules_evaluated: number;
    rules_triggered: number;
    findings_error: number;
    findings_warning: number;
    findings_info: number;
  };
  rule_catalog?: EmcRuleMeta[];
  notes: string[];
}

export interface EmcAuditOptions {
  categories?: EmcCategory[];
  minSeverity?: EmcSeverity;
  includeRuleCatalog?: boolean;
  thresholds?: {
    x_cap_max_uf?: number;
    y_cap_max_nf?: number;
    hf_decoupling_max_uf?: number;
  };
}

// ---------------------------------------------------------------------------
// Net classification (configurable via exported constants — companies adapt
// these regexes to their own net-naming conventions)
// ---------------------------------------------------------------------------

export const NET_PATTERNS = {
  lineL: /^(L|LIVE|AC[-_ ]?L|ACL|AC1|ACIN[-_ ]?L|AC_?LIVE|LIN)$/i,
  lineN: /^(N|NEUTRAL|NEU|AC[-_ ]?N|ACN|AC2|ACIN[-_ ]?N|AC_?NEUTRAL)$/i,
  pe: /^(PE|EARTH|FG|GND[-_ ]?EARTH|CHASSIS|CHG|PROTECTIVE[-_ ]?EARTH)$/i,
  ground: /^(GND|COM|RTN|RETURN|AGND|DGND|SGND|PGND|PG[-_ ]?GND|KGND|GNDA|GNDD|GND\d+|K\d+|PRI(MARY)?[-_ ]?GND|SEC(ONDARY)?[-_ ]?GND|PWR?[-_ ]?GND|LOGIC[-_ ]?GND|ANALOG[-_ ]?GND|DIGITAL[-_ ]?GND|HOT[-_ ]?GND)([_-].*)?$/i,
  rail: /^(VCC|VDD|VBB|VEE|VBAT|VBATT|VBUS|VIN|VOUT|VREF|AVDD|DVDD|3V3|1V8|2V5|5V|9V|12V|15V|24V|28V|48V|[+-]?\d+(\.\d+)?V|[+-]?V)([_-].*)?$/i,
};

export type NetClass =
  | { kind: "line_l" }
  | { kind: "line_n" }
  | { kind: "pe" }
  | { kind: "ground"; subtype: "plain" | "primary" | "logic" }
  | { kind: "rail" }
  | { kind: "other" };

const GROUND_PRIMARY = /^(PGND|PG[-_ ]?GND|KGND|K\d+|PRI(MARY)?[-_ ]?GND|PWR?[-_ ]?GND|HOT[-_ ]?GND)/i;
const GROUND_LOGIC = /^(SGND|AGND|DGND|GNDA|GNDD|SEC(ONDARY)?[-_ ]?GND|LOGIC[-_ ]?GND|ANALOG[-_ ]?GND|DIGITAL[-_ ]?GND)/i;

export function classifyNet(name: string): NetClass {
  if (NET_PATTERNS.lineL.test(name)) return { kind: "line_l" };
  if (NET_PATTERNS.lineN.test(name)) return { kind: "line_n" };
  if (NET_PATTERNS.pe.test(name)) return { kind: "pe" };
  if (NET_PATTERNS.ground.test(name)) {
    if (GROUND_PRIMARY.test(name)) return { kind: "ground", subtype: "primary" };
    if (GROUND_LOGIC.test(name)) return { kind: "ground", subtype: "logic" };
    return { kind: "ground", subtype: "plain" };
  }
  if (NET_PATTERNS.rail.test(name)) return { kind: "rail" };
  return { kind: "other" };
}

// ---------------------------------------------------------------------------
// Component classification
// ---------------------------------------------------------------------------

/** Alphabetic prefix of a designator ("C10" -> "C", "FB2" -> "FB"). */
export function designatorPrefix(designator: string): string {
  const m = /^([A-Za-z]+)/.exec(designator);
  return (m?.[1] ?? "").toUpperCase();
}

/** Lowercased parameter text used for keyword recognition (Value+Description+Comment). */
function paramText(params: Record<string, string> | undefined): string {
  if (!params) return "";
  const wanted = ["value", "description", "comment", "desc", "part number", "manufacturer part number"];
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (wanted.includes(k.toLowerCase())) parts.push(`${k}=${v}`);
  }
  return parts.join(" ; ").toLowerCase();
}

export interface CompClass {
  prefix: string;
  kind:
    | "capacitor"
    | "resistor"
    | "inductor"
    | "transformer"
    | "diode"
    | "transistor"
    | "ic"
    | "connector"
    | "crystal"
    | "other";
  cmChoke: boolean;
  ferriteBead: boolean;
}

const CM_CHOKE_RE = /common[- _]?mode|cm[- _]?choke|共模|choke/i;
const FERRITE_RE = /ferrite|bead|磁珠/i;
const CRYSTAL_RE = /crystal|xtal|resonator|晶振|石英/i;
const MHZ_RE = /\d(\.\d+)?\s*mhz/i;
const MOSFET_RE = /mosfet|nmos|pmos|transistor|场效应/i;

export function classifyComponent(designator: string, params?: Record<string, string>): CompClass {
  const prefix = designatorPrefix(designator);
  const text = paramText(params);
  const cmChoke = CM_CHOKE_RE.test(text) || prefix === "FL" || (prefix === "L" && /choke|共模/.test(text));
  const ferriteBead = FERRITE_RE.test(text) || prefix === "FB";
  let kind: CompClass["kind"] = "other";
  if (prefix === "C" || prefix === "VC") kind = "capacitor";
  else if (prefix === "R" || prefix === "RN" || prefix === "PR") kind = "resistor";
  else if (prefix === "L") kind = "inductor";
  else if (prefix === "T" || prefix === "TR" || prefix === "TX") kind = "transformer";
  else if (prefix === "D" || prefix === "VD" || prefix === "ZD" || prefix === "TVS" || prefix === "LED")
    kind = "diode";
  else if (prefix === "Q" || prefix === "V") kind = "transistor";
  else if (prefix === "U") kind = "ic";
  else if (prefix === "J" || prefix === "P" || prefix === "CN" || prefix === "CON" || prefix === "XP")
    kind = "connector";
  else if (prefix === "X" || prefix === "Y") kind = "crystal";
  // Value/description overrides where the prefix is ambiguous.
  if (CRYSTAL_RE.test(text) || (kind !== "capacitor" && MHZ_RE.test(text))) kind = "crystal";
  if (kind === "transistor" && CRYSTAL_RE.test(text)) kind = "crystal";
  if (kind === "other" && MOSFET_RE.test(text)) kind = "transistor";
  return { prefix, kind, cmChoke, ferriteBead };
}

// ---------------------------------------------------------------------------
// Value parsing ("100nF", "0.1uF", "4n7", "103", "10k", "0R", "4R7")
// ---------------------------------------------------------------------------

const CAP_UNITS: Record<string, number> = { pf: 1e-12, nf: 1e-9, uf: 1e-6, "µf": 1e-6, "μf": 1e-6, mf: 1e-3, f: 1 };
const RES_UNITS: Record<string, number> = { r: 1, k: 1e3, m: 1e6 };

/** First token before separators — "0.1uF/50V X7R" -> "0.1uF". */
function firstToken(raw: string): string {
  return raw.trim().split(/[/,;\s]+/)[0] ?? "";
}

export function parseCapacitanceF(raw: string | undefined): number | null {
  if (!raw) return null;
  let t = firstToken(raw);
  if (!t) return null;
  // aNb / apB style: 4n7 -> 4.7 nF, 4p7 -> 4.7 pF.
  let m = /^(\d+)n(\d+)$/i.exec(t);
  if (m) return (Number(m[1]) + Number(m[2]) / Math.pow(10, m[2].length)) * 1e-9;
  m = /^(\d+)p(\d+)$/i.exec(t);
  if (m) return (Number(m[1]) + Number(m[2]) / Math.pow(10, m[2].length)) * 1e-12;
  m = /^(\d+)u(\d+)$/i.exec(t);
  if (m) return (Number(m[1]) + Number(m[2]) / Math.pow(10, m[2].length)) * 1e-6;
  // Explicit unit.
  m = /^(\d+(?:\.\d+)?)\s*(pf|nf|uf|µf|μf|mf|f)$/i.exec(t);
  if (m) return Number(m[1]) * CAP_UNITS[m[2].toLowerCase()];
  // Bare number or 3-digit EIA code on a capacitor: 103 -> 10e3 pF.
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) {
    const digits = m[1];
    if (digits.includes(".")) return Number(digits) * 1e-6; // "0.1" on a cap = 0.1uF convention
    if (digits.length === 3) {
      const ab = Number(digits.slice(0, 2));
      const c = Number(digits[2]);
      return ab * Math.pow(10, c) * 1e-12;
    }
    if (digits.length <= 2) return Number(digits) * 1e-12; // "47" -> 47pF convention
    return null;
  }
  return null;
}

export function parseResistanceOhm(raw: string | undefined): number | null {
  if (!raw) return null;
  const t = firstToken(raw);
  if (!t) return null;
  let m = /^(\d+)r(\d*)$/i.exec(t);
  if (m) {
    const frac = m[2] ? Number(m[2]) / Math.pow(10, m[2].length) : 0;
    return Number(m[1]) + frac;
  }
  m = /^(\d+(?:\.\d+)?)(k|m)$/i.exec(t);
  if (m) return Number(m[1]) * RES_UNITS[m[2].toLowerCase()];
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) return Number(m[1]);
  return null;
}

function formatF(f: number): string {
  if (f >= 1e-6) return `${round(f * 1e6, 2)}uF`;
  if (f >= 1e-9) return `${round(f * 1e9, 2)}nF`;
  return `${round(f * 1e12, 2)}pF`;
}

function round(v: number, digits = 2): number {
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
}

// ---------------------------------------------------------------------------
// Rule catalog (ids, severities, rationale text — no invented clause numbers)
// ---------------------------------------------------------------------------

export const EMC_RULE_CATALOG: EmcRuleMeta[] = [
  {
    rule_id: "EMC-S001",
    category: "conducted",
    default_severity: "warning",
    title: "AC 输入侧未识别到共模电感",
    checks: "存在 L/N 输入网络时，检查图中是否存在共模电感（designator 前缀 FL，或 Value/Description 含 common mode/CM choke/共模）。",
    basis: "共模电感是开关电源传导共模噪声抑制的第一道器件（通用 EMC 设计实践，参考 Ott《Electromagnetic Compatibility Engineering》电源滤波章节）。",
  },
  {
    rule_id: "EMC-S002",
    category: "conducted",
    default_severity: "warning",
    title: "L-N 之间未识别到 X 电容",
    checks: "存在 L 与 N 网络时，检查是否有电容一脚在 L、一脚在 N。",
    basis: "X 电容抑制差模传导噪声（通用开关电源 EMI 滤波器实践）。",
  },
  {
    rule_id: "EMC-S003",
    category: "conducted",
    default_severity: "info",
    title: "X 电容容值超出常规范围",
    checks: "解析 X 电容 Value 参数，超过阈值（默认 2.2uF，可配）时提示。",
    basis: "容值过大带来浪涌能量与体积问题，实践中 X 电容通常在 0.047–2.2uF 量级（阈值可按公司规范调整）。",
  },
  {
    rule_id: "EMC-S004",
    category: "conducted",
    default_severity: "warning",
    title: "存在 PE 网络但未识别到 Y 电容",
    checks: "存在 PE 网络时，检查是否有电容一脚在 PE、另一脚在一次/二次侧地或 N。",
    basis: "Y 电容为共模电流提供返回路径，是传导/辐射共模超标的关键抑制器件（通用实践；医疗等低漏电流应用需谨慎取值）。",
  },
  {
    rule_id: "EMC-S005",
    category: "conducted",
    default_severity: "warning",
    title: "Y 电容容值偏大",
    checks: "解析 Y 电容 Value，超过阈值（默认 4.7nF，可配）时提示漏电流风险。",
    basis: "Y 电容容值受漏电流限值约束（IEC/UL 对不同设备类别有不同限值，具体数值以目标标准为准）；容值无法解析时降级为 info。",
  },
  {
    rule_id: "EMC-S010",
    category: "decoupling",
    default_severity: "warning",
    title: "电源轨上无去耦电容",
    checks: "对每个含 IC 引脚的电源轨网络，检查该轨与任一地之间是否有电容。",
    basis: "每片 IC 的供电需要高频去耦路径，否则开关电流环路进入配电网络（通用 PCB EMC 实践）。",
  },
  {
    rule_id: "EMC-S011",
    category: "decoupling",
    default_severity: "info",
    title: "电源轨缺少高频小电容",
    checks: "电源轨上仅有 ≥1uF 级电容、无 ≤0.47uF（可配）小电容时提示。",
    basis: "大电容谐振点低，高频段需要小容量电容并联提供低阻抗（通用去耦网络设计实践）。",
  },
  {
    rule_id: "EMC-S020",
    category: "grounding",
    default_severity: "info",
    title: "多接地系统未识别到桥接元件",
    checks: "存在 ≥2 个不同名称的地网络（PGND/SGND/AGND 等）时，检查地网之间是否有 0Ω 电阻/磁珠/Y 电容等桥接元件。",
    basis: "非隔离设计通常需要 0Ω/磁珠单点连接；隔离设计一次/二次地之间通常经 Y 电容提供共模回路。两种意图都应显式体现在图面上。",
  },
  {
    rule_id: "EMC-S030",
    category: "switching",
    default_severity: "info",
    title: "变压器/功率电感绕组未识别到吸收网络",
    checks: "对每个变压器/电感，检查其网络对之间是否存在 R-C 串联、C 直跨或二极管钳位支路。",
    basis: "开关动作在漏感/杂散电感上产生电压尖峰，RC/RCD 吸收是功率级标准做法（若以其他形式实现请人工确认）。",
  },
  {
    rule_id: "EMC-S031",
    category: "switching",
    default_severity: "info",
    title: "MOSFET 栅极网络上无串联电阻",
    checks: "对每个晶体管的 G 脚所在网络，检查该网络上是否接有任何电阻。",
    basis: "栅极串联电阻控制开关沿速率并阻尼振铃，直接影响高频辐射（通用功率级实践；变压器直接驱动的设计属例外）。",
  },
  {
    rule_id: "EMC-S032",
    category: "interface",
    default_severity: "warning",
    title: "晶振两脚未识别到对地负载电容",
    checks: "对每个晶振（X/Y 前缀，或参数含 crystal/晶振/XTAL/xxMHz），检查两个振荡网络是否各有对地电容。",
    basis: "负载电容是振荡条件的一部分，取值由晶体规格决定；缺失或误放 0.1uF 级去耦电容都会造成 EMC 隐患（通用晶振电路实践）。",
  },
  {
    rule_id: "EMC-S040",
    category: "interface",
    default_severity: "info",
    title: "连接器信号网络直达 IC 且无 ESD/滤波元件",
    checks: "对每个连接器引脚网络（电源/地除外），若同时连接 IC 引脚，检查网络上是否有 TVS/二极管对地防护或串联电阻/磁珠。",
    basis: "外部接口需在连接器附近提供 ESD 泄放与高频滤波（通用接口防护实践）。",
  },
];

// ---------------------------------------------------------------------------
// Derived model built once per audit
// ---------------------------------------------------------------------------

interface PinRef {
  designator: string;
  pin: string;
}

interface EmcContext {
  data: SchematicAuditData;
  cls: Map<string, CompClass>;
  /** designator -> pin -> net ("" when unconnected). */
  pinNet: Map<string, Map<string, string>>;
  /** net -> pins on it. */
  netPins: Map<string, PinRef[]>;
  nets: string[];
  lineL: string | null;
  lineN: string | null;
  peNet: string | null;
  groundNets: string[];
  railNets: string[];
  thresholds: { xCapMaxUf: number; yCapMaxNf: number; hfMaxUf: number };
}

function buildContext(data: SchematicAuditData, thresholds: EmcContext["thresholds"]): EmcContext {
  const cls = new Map<string, CompClass>();
  for (const c of data.components) {
    cls.set(c.designator, classifyComponent(c.designator, data.componentParameters?.[c.designator]));
  }

  const pinNet = new Map<string, Map<string, string>>();
  const netPins = new Map<string, PinRef[]>();
  const addNetPin = (net: string, ref: PinRef) => {
    const list = netPins.get(net) ?? [];
    list.push(ref);
    netPins.set(net, list);
  };
  for (const row of data.pinNets) {
    let byPin = pinNet.get(row.designator);
    if (!byPin) {
      byPin = new Map<string, string>();
      pinNet.set(row.designator, byPin);
    }
    const net = row.unconnected ? "" : row.net;
    byPin.set(row.pin, net);
    if (net) addNetPin(net, { designator: row.designator, pin: row.pin });
  }

  const nets = [...new Set(data.pinNets.filter((r) => !r.unconnected && r.net).map((r) => r.net))];
  const netKind = new Map(nets.map((n) => [n, classifyNet(n)] as const));
  // Power ports also declare nets that may have no pin rows yet.
  for (const p of data.ports) {
    if (!netKind.has(p.net)) {
      netKind.set(p.net, classifyNet(p.net));
      nets.push(p.net);
    }
  }
  const find = (kind: string): string | null => {
    for (const [n, k] of netKind) if (k.kind === kind) return n;
    return null;
  };
  return {
    data,
    cls,
    pinNet,
    netPins,
    nets,
    lineL: find("line_l"),
    lineN: find("line_n"),
    peNet: find("pe"),
    groundNets: [...netKind].filter(([, k]) => k.kind === "ground").map(([n]) => n),
    railNets: [...netKind].filter(([, k]) => k.kind === "rail").map(([n]) => n),
    thresholds,
  };
}

function netsOfComp(ctx: EmcContext, designator: string): string[] {
  const byPin = ctx.pinNet.get(designator);
  if (!byPin) return [];
  return [...new Set([...byPin.values()].filter((n) => n !== ""))];
}

function isGroundNet(ctx: EmcContext, net: string): boolean {
  return ctx.groundNets.includes(net);
}

function twoPinNets(ctx: EmcContext, designator: string): [string, string] | null {
  const nets = netsOfComp(ctx, designator);
  if (nets.length !== 2) return null;
  return [nets[0], nets[1]];
}

function valueOf(ctx: EmcContext, designator: string): string | undefined {
  const params = ctx.data.componentParameters?.[designator];
  if (!params) return undefined;
  // Parameter names seen in real Altium exports: Value / value / VALUE.
  for (const k of Object.keys(params)) {
    if (k.toLowerCase() === "value") return params[k];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface RuleResult {
  findings: EmcFinding[];
  passed: EmcCheckPassed | null;
  skipped?: boolean;
  skipReason?: string;
}

type RuleFn = (ctx: EmcContext) => RuleResult;

const pass = (rule_id: string, summary: string): RuleResult => ({ findings: [], passed: { rule_id, summary } });
const skip = (rule_id: string, reason: string): RuleResult => ({
  findings: [],
  passed: null,
  skipped: true,
  skipReason: `${rule_id}: ${reason}`,
});
const finding = (meta: EmcRuleMeta, message: string, evidence: Record<string, unknown>, recommendation: string): EmcFinding => ({
  rule_id: meta.rule_id,
  category: meta.category,
  severity: meta.default_severity,
  message,
  evidence,
  recommendation,
});

const metaOf = (id: string): EmcRuleMeta => {
  const m = EMC_RULE_CATALOG.find((r) => r.rule_id === id);
  if (!m) throw new Error(`unknown rule id ${id}`);
  return m;
};

/** Capacitors whose two pins lie on netA / netB (either orientation). */
function capsBetween(ctx: EmcContext, netA: string, netB: string): string[] {
  const out: string[] = [];
  for (const [des, c] of ctx.cls) {
    if (c.kind !== "capacitor") continue;
    const pair = twoPinNets(ctx, des);
    if (!pair) continue;
    if ((pair[0] === netA && pair[1] === netB) || (pair[0] === netB && pair[1] === netA)) out.push(des);
  }
  return out;
}

/** Capacitors with one pin on netA and the other on any ground-classified net (or netB). */
function capsFromNetToGround(ctx: EmcContext, netA: string, alsoAllow?: string): string[] {
  const out: string[] = [];
  for (const [des, c] of ctx.cls) {
    if (c.kind !== "capacitor") continue;
    const pair = twoPinNets(ctx, des);
    if (!pair) continue;
    const other = pair[0] === netA ? pair[1] : pair[1] === netA ? pair[0] : null;
    if (other === null) continue;
    if (isGroundNet(ctx, other) || other === alsoAllow) out.push(des);
  }
  return out;
}

// --- conducted -------------------------------------------------------------

const ruleS001: RuleFn = (ctx) => {
  if (!ctx.lineL || !ctx.lineN) return skip("EMC-S001", "无 L/N 输入网络，规则不适用");
  const chokes: string[] = [];
  for (const [des, c] of ctx.cls) {
    if (c.cmChoke) chokes.push(des);
  }
  if (chokes.length === 0) {
    return {
      findings: [
        finding(
          metaOf("EMC-S001"),
          `检测到交流输入网络 (${ctx.lineL}/${ctx.lineN})，但未识别到共模电感`,
          { line_net: ctx.lineL, neutral_net: ctx.lineN, recognition_basis: "designator 前缀 FL，或参数含 common mode/CM choke/共模" },
          "在输入级增加共模电感（或确认其以其他命名/形式存在后忽略本条）；识别依赖命名与参数规范，建议在公司库中统一共模器件命名。",
        ),
      ],
      passed: null,
    };
  }
  return pass("EMC-S001", `识别到共模电感: ${chokes.join(", ")}`);
};

const ruleS002: RuleFn = (ctx) => {
  if (!ctx.lineL || !ctx.lineN) return skip("EMC-S002", "无 L/N 输入网络，规则不适用");
  const xcaps = capsBetween(ctx, ctx.lineL, ctx.lineN);
  if (xcaps.length === 0) {
    return {
      findings: [
        finding(
          metaOf("EMC-S002"),
          `L (${ctx.lineL}) 与 N (${ctx.lineN}) 之间未识别到任何电容（X 电容）`,
          { line_net: ctx.lineL, neutral_net: ctx.lineN },
          "在 L-N 之间布置 X 电容抑制差模噪声；若差模余量充足可忽略，但建议显式确认。",
        ),
      ],
      passed: null,
    };
  }
  return pass("EMC-S002", `X 电容: ${xcaps.join(", ")}`);
};

const ruleS003: RuleFn = (ctx) => {
  if (!ctx.lineL || !ctx.lineN) return skip("EMC-S003", "无 L/N 输入网络，规则不适用");
  const xcaps = capsBetween(ctx, ctx.lineL, ctx.lineN);
  if (xcaps.length === 0) return skip("EMC-S003", "无 X 电容，无值可查");
  const findings: EmcFinding[] = [];
  let unparseable = 0;
  for (const des of xcaps) {
    const f = parseCapacitanceF(valueOf(ctx, des));
    if (f === null) {
      unparseable++;
      continue;
    }
    if (f > ctx.thresholds.xCapMaxUf * 1e-6) {
      findings.push(
        finding(
          metaOf("EMC-S003"),
          `X 电容 ${des} 容值 ${formatF(f)} 超过阈值 ${ctx.thresholds.xCapMaxUf}uF`,
          { designator: des, value: valueOf(ctx, des), parsed: formatF(f) },
          "核对浪涌与体积约束；若为公司规范允许的取值请调整阈值配置。",
        ),
      );
    }
  }
  if (findings.length === 0) {
    return pass("EMC-S003", `${xcaps.length} 个 X 电容容值在阈值内${unparseable > 0 ? `（${unparseable} 个无法解析值，未判）` : ""}`);
  }
  return { findings, passed: null };
};

const ruleS004: RuleFn = (ctx) => {
  if (!ctx.peNet) return skip("EMC-S004", "无 PE 网络，规则不适用");
  const ycaps = capsFromNetToGround(ctx, ctx.peNet, ctx.lineN ?? "");
  if (ycaps.length === 0) {
    return {
      findings: [
        finding(
          metaOf("EMC-S004"),
          `存在保护地网络 (${ctx.peNet})，但未识别到 Y 电容（PE 对地/对 N）`,
          { pe_net: ctx.peNet },
          "在 PE 与一次侧地（或 N，视拓扑）之间布置 Y 电容，为共模电流提供回路；若本设计确实无需 Y 电容请显式确认。",
        ),
      ],
      passed: null,
    };
  }
  return pass("EMC-S004", `Y 电容: ${ycaps.join(", ")}`);
};

const ruleS005: RuleFn = (ctx) => {
  if (!ctx.peNet) return skip("EMC-S005", "无 PE 网络，规则不适用");
  const ycaps = capsFromNetToGround(ctx, ctx.peNet, ctx.lineN ?? "");
  if (ycaps.length === 0) return skip("EMC-S005", "无 Y 电容，无值可查");
  const findings: EmcFinding[] = [];
  const unknown: string[] = [];
  for (const des of ycaps) {
    const f = parseCapacitanceF(valueOf(ctx, des));
    if (f === null) {
      unknown.push(des);
      continue;
    }
    if (f > ctx.thresholds.yCapMaxNf * 1e-9) {
      findings.push(
        finding(
          metaOf("EMC-S005"),
          `Y 电容 ${des} 容值 ${formatF(f)} 超过阈值 ${ctx.thresholds.yCapMaxNf}nF，漏电流风险`,
          { designator: des, value: valueOf(ctx, des), parsed: formatF(f) },
          "按目标标准的漏电流限值核算总容值（多只 Y 电容并联时按总和核算）；医疗/手持类应用通常需显著更小取值。",
        ),
      );
    }
  }
  if (unknown.length > 0) {
    findings.push(
      finding(
        metaOf("EMC-S005"),
        `Y 电容 ${unknown.join(", ")} 的 Value 参数无法解析为容值，未做漏电流核算`,
        { designators: unknown, values: unknown.map((d) => valueOf(ctx, d)) },
        "规范电容 Value 参数格式（如 2.2nF / 4n7），使漏电流核算可自动化。",
      ),
    );
    // Value-unparseable is informational even when under threshold elsewhere.
    const idx = findings.length - 1;
    findings[idx] = { ...findings[idx], severity: "info" };
  }
  if (findings.length === 0) {
    return pass("EMC-S005", `${ycaps.length} 个 Y 电容容值在阈值内`);
  }
  return { findings, passed: null };
};

// --- decoupling ------------------------------------------------------------

const ruleS010 = (ctx: EmcContext): RuleResult => {
  const findings: EmcFinding[] = [];
  const okRails: string[] = [];
  let checkedRails = 0;
  for (const rail of ctx.railNets) {
    const icPins = (ctx.netPins.get(rail) ?? []).filter((p) => ctx.cls.get(p.designator)?.kind === "ic");
    if (icPins.length === 0) continue;
    checkedRails++;
    const decoupling: string[] = [];
    for (const [des, c] of ctx.cls) {
      if (c.kind !== "capacitor") continue;
      const pair = twoPinNets(ctx, des);
      if (!pair) continue;
      const other = pair[0] === rail ? pair[1] : pair[1] === rail ? pair[0] : null;
      if (other !== null && isGroundNet(ctx, other)) decoupling.push(des);
    }
    if (decoupling.length === 0) {
      findings.push(
        finding(
          metaOf("EMC-S010"),
          `电源轨 ${rail} 上有 ${icPins.length} 个 IC 引脚，但该轨对地没有任何去耦电容`,
          { rail, ic_pins: icPins.map((p) => `${p.designator}.${p.pin}`) },
          "为该轨每个 IC 就近添加去耦电容（原理图上体现为轨对地电容）。",
        ),
      );
    } else {
      okRails.push(`${rail}(${decoupling.length})`);
    }
  }
  if (checkedRails === 0) return skip("EMC-S010", "未识别到含 IC 引脚的电源轨（命名需匹配 VCC/VDD/xV 等，可在 NET_PATTERNS.rail 调整）");
  if (findings.length === 0) return pass("EMC-S010", `全部 ${checkedRails} 个含 IC 的电源轨均有去耦电容: ${okRails.join(", ")}`);
  return { findings, passed: null };
};

const ruleS011 = (ctx: EmcContext): RuleResult => {
  const findings: EmcFinding[] = [];
  const okRails: string[] = [];
  let checkedRails = 0;
  for (const rail of ctx.railNets) {
    const icPins = (ctx.netPins.get(rail) ?? []).filter((p) => ctx.cls.get(p.designator)?.kind === "ic");
    if (icPins.length === 0) continue;
    checkedRails++;
    let hasHf = false;
    let hasBig = false;
    const unknown: string[] = [];
    for (const [des, c] of ctx.cls) {
      if (c.kind !== "capacitor") continue;
      const pair = twoPinNets(ctx, des);
      if (!pair) continue;
      const other = pair[0] === rail ? pair[1] : pair[1] === rail ? pair[0] : null;
      if (other === null || !isGroundNet(ctx, other)) continue;
      const f = parseCapacitanceF(valueOf(ctx, des));
      if (f === null) {
        unknown.push(des);
        continue;
      }
      if (f <= ctx.thresholds.hfMaxUf * 1e-6) hasHf = true;
      else hasBig = true;
    }
    if (!hasHf && hasBig) {
      findings.push(
        finding(
          metaOf("EMC-S011"),
          `电源轨 ${rail} 上只有 ≥${ctx.thresholds.hfMaxUf}uF 的大电容，未识别到高频小电容`,
          { rail, bulk_caps_only: true, unparsed: unknown },
          "在大电容之外并联 0.1uF 级陶瓷电容，覆盖高频段去耦。",
        ),
      );
    } else {
      okRails.push(rail);
    }
  }
  if (checkedRails === 0) return skip("EMC-S011", "未识别到含 IC 引脚的电源轨");
  if (findings.length === 0) return pass("EMC-S011", `含 IC 的电源轨均有高频小电容或无大电容独占情况: ${okRails.join(", ")}`);
  return { findings, passed: null };
};

// --- grounding -------------------------------------------------------------

const ruleS020: RuleFn = (ctx) => {
  if (ctx.groundNets.length < 2) return skip("EMC-S020", "少于 2 个地网络，规则不适用");
  const groundSet = new Set(ctx.groundNets);
  const bridges: string[] = [];
  for (const [des, c] of ctx.cls) {
    if (c.kind !== "resistor" && c.kind !== "capacitor" && !c.ferriteBead) continue;
    const nets = netsOfComp(ctx, des);
    const onGround = nets.filter((n) => groundSet.has(n));
    if (onGround.length >= 2 && new Set(onGround).size >= 2) bridges.push(des);
  }
  if (bridges.length === 0) {
    return {
      findings: [
        finding(
          metaOf("EMC-S020"),
          `存在 ${ctx.groundNets.length} 个地网络 (${ctx.groundNets.join(", ")})，但地网之间未识别到任何桥接元件（0Ω 电阻/磁珠/Y 电容）`,
          { ground_nets: ctx.groundNets },
          "非隔离设计：确认地平面在 PCB 上单点相连并在原理图显式画出桥接；隔离设计：确认一次/二次地之间的 Y 电容安排。若为有意隔离请忽略。",
        ),
      ],
      passed: null,
    };
  }
  return pass("EMC-S020", `地网桥接元件: ${bridges.join(", ")}`);
};

// --- switching ---------------------------------------------------------------

const ruleS030: RuleFn = (ctx) => {
  const findings: EmcFinding[] = [];
  const checked: string[] = [];
  for (const [des, c] of ctx.cls) {
    if (c.kind !== "transformer" && c.kind !== "inductor") continue;
    if (c.cmChoke || c.ferriteBead) continue; // filter parts, not switching magnetics
    const nets = netsOfComp(ctx, des);
    if (nets.length < 2) continue;
    checked.push(des);
    const netSet = new Set(nets);
    let snubbed = false;
    const detail: string[] = [];
    for (const [rDes, rc] of ctx.cls) {
      if (snubbed) break;
      if (rc.kind === "diode") {
        // Diode clamp directly across two of the magnetics' nets.
        const dNets = netsOfComp(ctx, rDes);
        const across = dNets.filter((n) => netSet.has(n));
        if (new Set(across).size >= 2) {
          snubbed = true;
          detail.push(`D 钳位 ${rDes}`);
        }
      }
      if (rc.kind === "capacitor") {
        // C directly across, or C as part of an R-C chain.
        const cNets = netsOfComp(ctx, rDes);
        const across = cNets.filter((n) => netSet.has(n));
        if (new Set(across).size >= 2) {
          snubbed = true;
          detail.push(`C 跨接 ${rDes}`);
        }
        for (const cn of cNets) {
          if (netSet.has(cn)) continue;
          // C: cn <-> magNet; look for R between cn and another mag net.
          for (const [rr, rrClass] of ctx.cls) {
            if (rrClass.kind !== "resistor") continue;
            const rNets = netsOfComp(ctx, rr);
            if (rNets.includes(cn) && rNets.some((rn) => netSet.has(rn) && rn !== rNets[rNets.indexOf(cn)])) {
              // R (cn, magA) and C (cn, magB) with magA != magB?
              const magA = rNets.find((rn) => netSet.has(rn) && rn !== cn);
              const magB = cNets.find((nn) => netSet.has(nn) && nn !== cn);
              if (magA !== undefined && magB !== undefined && magA !== magB) {
                snubbed = true;
                detail.push(`RC 吸收 ${rr}+${rDes}`);
              }
            }
          }
        }
      }
    }
    if (!snubbed) {
      findings.push(
        finding(
          metaOf("EMC-S030"),
          `${des}（${c.kind === "transformer" ? "变压器" : "功率电感"}）的网络间未识别到 RC/RCD 吸收或二极管钳位`,
          { designator: des, nets, recognition_basis: "R-C 串联跨绕组 / C 直跨 / D 钳位（任意两只网络脚）" },
          "评估漏感尖峰与振铃，必要时增加 RCD/RC 吸收；若以其他形式实现（如器件内置、有源钳位）请人工确认后忽略。",
        ),
      );
    }
    void detail;
  }
  if (checked.length === 0) return skip("EMC-S030", "未识别到变压器/功率电感");
  if (findings.length === 0) return pass("EMC-S030", `${checked.length} 个磁性器件均识别到吸收/钳位支路`);
  return { findings, passed: null };
};

const ruleS031: RuleFn = (ctx) => {
  const findings: EmcFinding[] = [];
  let checked = 0;
  for (const pinRow of ctx.data.pinNets) {
    const c = ctx.cls.get(pinRow.designator);
    if (!c || c.kind !== "transistor") continue;
    const pinInfo = ctx.data.pins.find(
      (p) => p.designator === pinRow.designator && (p.pinDesignator || p.pinName) === pinRow.pin,
    );
    const name = (pinInfo?.pinName ?? "").trim();
    if (!/^(g|gate)$/i.test(name) && !/^(g|gate)$/i.test(pinRow.pin)) continue;
    if (!pinRow.net || pinRow.unconnected) continue;
    checked++;
    const hasSeriesR = (ctx.netPins.get(pinRow.net) ?? []).some((p) => {
      const pc = ctx.cls.get(p.designator);
      return pc?.kind === "resistor";
    });
    if (!hasSeriesR) {
      findings.push(
        finding(
          metaOf("EMC-S031"),
          `晶体管 ${pinRow.designator} 栅极 (${pinRow.designator}.${pinRow.pin}, 网络 ${pinRow.net}) 上未识别到任何电阻`,
          { designator: pinRow.designator, pin: pinRow.pin, net: pinRow.net },
          "评估增加栅极串联电阻以控制开关沿并阻尼振铃；变压器直接驱动栅极的设计属已知例外。",
        ),
      );
    }
  }
  if (checked === 0) return skip("EMC-S031", "未识别到带 G 脚网络的晶体管");
  if (findings.length === 0) return pass("EMC-S031", `${checked} 个栅极网络均接有电阻`);
  return { findings, passed: null };
};

// --- interface ----------------------------------------------------------------

const ruleS032: RuleFn = (ctx) => {
  const findings: EmcFinding[] = [];
  let checked = 0;
  for (const comp of ctx.data.components) {
    const c = ctx.cls.get(comp.designator);
    if (!c || c.kind !== "crystal") continue;
    const nets = netsOfComp(ctx, comp.designator);
    if (nets.length !== 2) continue;
    checked++;
    // Any cap to ground counts as present; >1nF on an oscillator net is
    // suspicious (probably a misplaced decoupling cap) and flagged separately.
    const perSide = nets.map((net) => capsFromNetToGround(ctx, net));
    const missingSides = perSide.filter((caps) => caps.length === 0).length;
    const suspicious = perSide.flat().filter((des) => {
      const f = parseCapacitanceF(valueOf(ctx, des));
      return f !== null && f > 1e-9;
    });
    if (missingSides > 0) {
      findings.push(
        finding(
          metaOf("EMC-S032"),
          `晶振 ${comp.designator} 的振荡网络 (${nets.join(", ")}) 有 ${missingSides} 侧缺少对地负载电容`,
          { designator: comp.designator, nets, load_caps: perSide.flat() },
          "按晶体规格添加负载电容并使走线短捷；负载电容取值由晶体 datasheet 决定。",
        ),
      );
    } else if (suspicious.length > 0) {
      findings.push(
        finding(
          metaOf("EMC-S032"),
          `晶振 ${comp.designator} 网络上的 ${suspicious.join(", ")} 容值 >1nF，疑似误用去耦电容`,
          { designator: comp.designator, suspicious },
          "负载电容通常为 pF 级；核对是否误把 0.1uF 去耦放在了振荡网络。",
        ),
      );
    }
  }
  if (checked === 0) return skip("EMC-S032", "未识别到晶振（X/Y 前缀或参数含 crystal/晶振/MHz）");
  if (findings.length === 0) return pass("EMC-S032", `${checked} 个晶振两侧均有负载电容`);
  return { findings, passed: null };
};

const ruleS040: RuleFn = (ctx) => {
  const findings: EmcFinding[] = [];
  let checked = 0;
  for (const [des, c] of ctx.cls) {
    if (c.kind !== "connector") continue;
    for (const net of netsOfComp(ctx, des)) {
      if (isGroundNet(ctx, net) || net === ctx.peNet || net === ctx.lineL || net === ctx.lineN) continue;
      if (classifyNet(net).kind === "rail") continue;
      const pins = ctx.netPins.get(net) ?? [];
      const reachesIc = pins.some((p) => ctx.cls.get(p.designator)?.kind === "ic" && p.designator !== des);
      if (!reachesIc) continue;
      checked++;
      const hasProtection = pins.some((p) => {
        const pc = ctx.cls.get(p.designator);
        if (p.designator === des) return false;
        if (pc?.kind === "resistor" || pc?.ferriteBead) return true;
        if (pc?.kind === "diode") {
          const dNets = netsOfComp(ctx, p.designator);
          return dNets.some((n) => isGroundNet(ctx, n) || n === ctx.peNet);
        }
        return false;
      });
      if (!hasProtection) {
        findings.push(
          finding(
            metaOf("EMC-S040"),
            `连接器 ${des} 的信号网络 ${net} 直达 IC 引脚，网络上看不到 TVS/对地二极管或串联电阻/磁珠`,
            { connector: des, net },
            "在连接器入口处评估 TVS/ESD 器件与串阻/磁珠滤波；纯内部板间连接器可忽略。",
          ),
        );
      }
      if (findings.length >= 20) return { findings, passed: null };
    }
  }
  if (checked === 0) return skip("EMC-S040", "未识别到连接器—IC 直连信号网络");
  if (findings.length === 0) return pass("EMC-S040", `${checked} 个连接器信号网络均有防护元件或串阻`);
  return { findings, passed: null };
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

const RULES: Array<{ category: EmcCategory; fn: RuleFn }> = [
  { category: "conducted", fn: ruleS001 },
  { category: "conducted", fn: ruleS002 },
  { category: "conducted", fn: ruleS003 },
  { category: "conducted", fn: ruleS004 },
  { category: "conducted", fn: ruleS005 },
  { category: "decoupling", fn: ruleS010 },
  { category: "decoupling", fn: ruleS011 },
  { category: "grounding", fn: ruleS020 },
  { category: "switching", fn: ruleS030 },
  { category: "switching", fn: ruleS031 },
  { category: "interface", fn: ruleS032 },
  { category: "interface", fn: ruleS040 },
];

const SEVERITY_ORDER: Record<EmcSeverity, number> = { error: 3, warning: 2, info: 1 };

export function runEmcAudit(data: SchematicAuditData, options: EmcAuditOptions = {}): EmcAuditReport {
  const categories = options.categories;
  const minSeverity = options.minSeverity ?? "info";
  const thresholds = {
    xCapMaxUf: options.thresholds?.x_cap_max_uf ?? 2.2,
    yCapMaxNf: options.thresholds?.y_cap_max_nf ?? 4.7,
    hfMaxUf: options.thresholds?.hf_decoupling_max_uf ?? 0.47,
  };
  const ctx = buildContext(data, thresholds);

  const findings: EmcFinding[] = [];
  const passed: EmcCheckPassed[] = [];
  const notes: string[] = [];
  let rulesEvaluated = 0;
  let rulesTriggered = 0;

  for (const rule of RULES) {
    if (categories && !categories.includes(rule.category)) continue;
    const result = rule.fn(ctx);
    if (result.skipped) {
      if (result.skipReason) notes.push(`[skip] ${result.skipReason}`);
      continue;
    }
    rulesEvaluated++;
    if (result.findings.length > 0) rulesTriggered++;
    for (const f of result.findings) {
      if (SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[minSeverity]) findings.push(f);
    }
    if (result.passed) passed.push(result.passed);
  }

  const order: EmcSeverity[] = ["error", "warning", "info"];
  findings.sort((a, b) => {
    const d = order.indexOf(a.severity) - order.indexOf(b.severity);
    return d !== 0 ? d : a.rule_id.localeCompare(b.rule_id);
  });

  const report: EmcAuditReport = {
    tool: "emc_audit",
    data_source: data.dmAvailable ? "compiled-dm" : "geometry-fallback",
    sheet_summary: {
      components: data.components.length,
      nets: ctx.nets.length,
      line_nets: [ctx.lineL, ctx.lineN].filter((n): n is string => n !== null),
      pe_net: ctx.peNet,
      ground_nets: ctx.groundNets,
      rail_nets: ctx.railNets,
      dm_note: data.dmAvailable
        ? "verdicts based on compiled netlist (DM layer)"
        : `compiled netlist unavailable (${data.dmError ?? "unknown"}) — run compile_project and retry; net membership is heuristic`,
    },
    findings,
    checks_passed: passed,
    summary: {
      rules_evaluated: rulesEvaluated,
      rules_triggered: rulesTriggered,
      findings_error: findings.filter((f) => f.severity === "error").length,
      findings_warning: findings.filter((f) => f.severity === "warning").length,
      findings_info: findings.filter((f) => f.severity === "info").length,
    },
    notes,
  };
  if (options.includeRuleCatalog) report.rule_catalog = EMC_RULE_CATALOG;
  if (!data.dmAvailable) {
    report.notes.push(
      "几何回退模式：网络归属由几何推断，规则结论权威性下降 — 先 compile_project 再运行 emc_audit。",
    );
  }
  report.notes.push(
    "本工具只做确定性规则判定（网表+参数+命名），不替代 EMC 仿真与实测；阈值与网络命名识别均可配置（NET_PATTERNS / thresholds）。",
  );
  return report;
}
