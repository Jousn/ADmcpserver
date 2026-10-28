/**
 * Deterministic intent parsing for natural-language schematic editing.
 *
 * Purpose: give MCP clients a **no-LLM fallback path** — a conservative
 * Chinese/English pattern parser that converts short editing commands into
 * typed intents, which `planner.ts` then expands into edit_schematic /
 * emc_audit tool calls validated against the real zod schemas.
 *
 * Design rule: when a pattern does not match with high confidence, return
 * `unknown` — the LLM planning path (see prompts.ts) handles fuzzy input.
 * Never guess coordinates or designators.
 */

export type Intent =
  | {
      kind: "place_component";
      libReference: string;
      designator: string;
      xMils: number;
      yMils: number;
      rotationDeg?: number;
    }
  | {
      kind: "move";
      designator: string;
      xMils: number;
      yMils: number;
      rotationDeg?: number;
    }
  | { kind: "rotate"; designator: string; rotationDeg: number }
  | {
      kind: "label";
      netName: string;
      xMils: number;
      yMils: number;
      rotationDeg?: number;
    }
  | { kind: "gnd"; xMils: number; yMils: number }
  | { kind: "vcc"; xMils: number; yMils: number; netName?: string }
  | { kind: "text"; text: string; xMils: number; yMils: number }
  | { kind: "delete_component"; designator: string }
  | { kind: "info"; designator: string }
  | { kind: "audit_emc" }
  | { kind: "unknown"; raw: string; reason: string };

const DESIGNATOR_RE = /\b([A-Z]{1,2}\d{1,4}[A-Z]?)\b/;

interface Coords {
  xMils: number;
  yMils: number;
}

function normalize(raw: string): string {
  return raw
    .replace(/，/g, ",")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/：/g, ":")
    .replace(/；/g, ";")
    .replace(/\s+/g, " ")
    .trim();
}

function findCoords(s: string): Coords | null {
  let m = s.match(/\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?/);
  if (m) return { xMils: Number(m[1]), yMils: Number(m[2]) };
  m = s.match(/x\s*[=:]\s*(-?\d+)\s+y\s*[=:]\s*(-?\d+)/i);
  if (m) return { xMils: Number(m[1]), yMils: Number(m[2]) };
  return null;
}

function findDesignator(s: string): string | null {
  const m = s.match(DESIGNATOR_RE);
  return m ? m[1] : null;
}

function findDegrees(s: string): number | null {
  // Strip designator tokens first: "Q2" must not contribute its digits.
  const sNoDes = s.replace(DESIGNATOR_RE, " ");
  const withUnit = sNoDes.match(/(\d{1,3})\s*(?:度|°|deg)\b/i);
  if (withUnit) return Number(withUnit[1]);
  const bare = sNoDes.match(/\b(\d{1,3})\b/);
  return bare ? Number(bare[1]) : null;
}

function findQuoted(s: string): string | null {
  const m = s.match(/["“]([^"”]+)["”]/);
  return m ? m[1].trim() : null;
}

export function parseIntent(rawInput: string): Intent {
  const s = normalize(rawInput);
  if (s.length === 0) {
    return { kind: "unknown", raw: rawInput, reason: "空输入" };
  }

  // 1) EMC audit
  if (/emc|电磁兼容/i.test(s) && /检查|审[计查]|扫/i.test(s)) {
    return { kind: "audit_emc" };
  }

  // 2) delete component
  if (/删除|删掉|移除|delete|remove/i.test(s)) {
    const designator = findDesignator(s);
    return designator
      ? { kind: "delete_component", designator }
      : { kind: "unknown", raw: rawInput, reason: "删除命令未识别到位号" };
  }

  // 3) rotate
  if (/旋转|rotate/i.test(s)) {
    const designator = findDesignator(s);
    const deg = findDegrees(s);
    if (designator !== null && deg !== null) {
      return { kind: "rotate", designator, rotationDeg: deg };
    }
    return { kind: "unknown", raw: rawInput, reason: "旋转命令未识别到位号或角度" };
  }

  // 4) move
  if (/移动|移到|挪到|move\s+to/i.test(s)) {
    const designator = findDesignator(s);
    const coords = findCoords(s);
    if (designator !== null && coords !== null) {
      const deg = /并?旋转/.test(s) ? findDegrees(s.replace(/move\s+to/i, "")) : null;
      return {
        kind: "move",
        designator,
        xMils: coords.xMils,
        yMils: coords.yMils,
        rotationDeg: deg !== null && Number.isFinite(deg) ? deg : undefined,
      };
    }
    return { kind: "unknown", raw: rawInput, reason: "移动命令未识别到位号或坐标" };
  }

  const coords = findCoords(s);

  // 5) GND symbol
  if (/gnd|接地|地线|地端/i.test(s) && coords !== null) {
    return { kind: "gnd", xMils: coords.xMils, yMils: coords.yMils };
  }

  // 6) VCC / power port
  if (/vcc|电源端口|电源符号/i.test(s) && coords !== null) {
    const net = s.match(/([+-]?\d+(?:\.\d+)?\s*V[A-Z0-9+]*)/i);
    return {
      kind: "vcc",
      xMils: coords.xMils,
      yMils: coords.yMils,
      netName: net ? net[1].replace(/\s+/g, "") : undefined,
    };
  }

  // 7) net label
  if (/网络标签|标签|net\s*label|label/i.test(s)) {
    if (coords === null) {
      return { kind: "unknown", raw: rawInput, reason: "标签命令未识别到坐标" };
    }
    const netName =
      findQuoted(s) ??
      (s.match(/(?:标签|label)\s*:?\s*([A-Za-z0-9_+.()-]+?)(?=\s*(?:在|at|于|@|\(|x\s*[=:]))/i)?.[1] ??
        null);
    if (netName === null) {
      return { kind: "unknown", raw: rawInput, reason: "标签命令未识别到网络名" };
    }
    return { kind: "label", netName, xMils: coords.xMils, yMils: coords.yMils };
  }

  // 8) free text
  if (/文本|文字|注释|add\s+text/i.test(s)) {
    const text = findQuoted(s);
    if (text !== null && coords !== null) {
      return { kind: "text", text, xMils: coords.xMils, yMils: coords.yMils };
    }
    return { kind: "unknown", raw: rawInput, reason: "文本命令需引号内容与坐标" };
  }

  // 9) place component: 放置 <lib_reference> [位号 R1] 在 (x,y)
  if (/放置|放一[个颗只]|放上?|place|put/i.test(s)) {
    if (coords === null) {
      return { kind: "unknown", raw: rawInput, reason: "放置命令未识别到坐标" };
    }
    const designator =
      s.match(/(?:位号|编号|designator)\s*[:=]?\s*([A-Z]{1,2}\d{1,4}[A-Z]?)/i)?.[1] ??
      findDesignator(s.split(/在|at|@|\(/)[0]) ??
      null;
    const lib =
      findQuoted(s) ??
      s
        .match(/(?:放置|放一[个颗只]|放上?|place|put)\s+(?:一个\s+|an?\s+|the\s+)?([^ ]+?)(?=\s+(?:位号|编号|designator|在|at|于|@))/i)
        ?.[1] ??
      null;
    if (lib === null || designator === null) {
      return { kind: "unknown", raw: rawInput, reason: "放置命令未识别到库引用或位号" };
    }
    const rot = /旋转/.test(s) ? findDegrees(s) : null;
    return {
      kind: "place_component",
      libReference: lib,
      designator,
      xMils: coords.xMils,
      yMils: coords.yMils,
      rotationDeg: rot !== null && Number.isFinite(rot) ? rot : undefined,
    };
  }

  // 10) component info
  if (/查看|详情|信息|读取|查一下|info|detail/i.test(s)) {
    const designator = findDesignator(s);
    return designator
      ? { kind: "info", designator }
      : { kind: "unknown", raw: rawInput, reason: "查询命令未识别到位号" };
  }

  return { kind: "unknown", raw: rawInput, reason: "未匹配任何已知命令模式" };
}
