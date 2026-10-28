import { describe, expect, it } from "vitest";
import { editSchematicInputSchema } from "../src/tools/editSchematic.js";
import { emcAuditInputSchema } from "../src/tools/emcAudit.js";
import { parseIntent } from "../src/orchestration/intents.js";
import { planFromIntent, type PlanContext } from "../src/orchestration/planner.js";
import {
  DETERMINISTIC_FALLBACK_NOTE,
  EDIT_SCHEMATIC_ACTIONS,
  plannerSystemPrompt,
} from "../src/orchestration/prompts.js";

const ctx: PlanContext = {
  schematicFullPath: "D:\\proj\\power.SchDoc",
};

describe("parseIntent（确定性中文命令解析）", () => {
  it("放置元件：含库引用、位号、坐标", () => {
    const i = parseIntent("放置 Res2 位号 R1 在 (1000,500)");
    expect(i).toMatchObject({
      kind: "place_component",
      libReference: "Res2",
      designator: "R1",
      xMils: 1000,
      yMils: 500,
    });
  });

  it("旋转：位号 + 角度", () => {
    const i = parseIntent("把 Q2 旋转 90 度");
    expect(i).toMatchObject({ kind: "rotate", designator: "Q2", rotationDeg: 90 });
  });

  it("移动：位号 + 坐标（支持 x=/y= 写法与负数）", () => {
    const i = parseIntent("移动 C10 到 x=-200 y=350");
    expect(i).toMatchObject({ kind: "move", designator: "C10", xMils: -200, yMils: 350 });
  });

  it("GND：坐标即可", () => {
    expect(parseIntent("在 (800,600) 放一个 GND")).toMatchObject({
      kind: "gnd",
      xMils: 800,
      yMils: 600,
    });
  });

  it("VCC：识别网络名", () => {
    const i = parseIntent("放 VCC 3.3V 在 (800,100)");
    expect(i).toMatchObject({ kind: "vcc", xMils: 800, yMils: 100, netName: "3.3V" });
  });

  it("网络标签：引号名 + 坐标", () => {
    const i = parseIntent('添加网络标签 "NET_PGOOD" 在 (1200,300)');
    expect(i).toMatchObject({ kind: "label", netName: "NET_PGOOD", xMils: 1200, yMils: 300 });
  });

  it("删除元件", () => {
    expect(parseIntent("删除 R5")).toMatchObject({
      kind: "delete_component",
      designator: "R5",
    });
  });

  it("查询元件详情", () => {
    expect(parseIntent("查看 U3 的详情")).toMatchObject({ kind: "info", designator: "U3" });
  });

  it("EMC 审计", () => {
    expect(parseIntent("对当前图纸做 EMC 检查")).toMatchObject({ kind: "audit_emc" });
  });

  it("无法解析时返回 unknown，绝不猜测", () => {
    const i = parseIntent("帮我画一个图腾柱 PFC 的完整原理图");
    expect(i.kind).toBe("unknown");
  });

  it("缺少坐标的放置命令返回 unknown", () => {
    expect(parseIntent("放置一个电容").kind).toBe("unknown");
  });
});

describe("planFromIntent（计划展开 + 真实 schema 校验）", () => {
  it("每个产出的 edit_schematic 计划都通过 editSchematicInputSchema", () => {
    const cases = [
      "放置 Res2 位号 R1 在 (1000,500)",
      "把 Q2 旋转 90 度",
      "移动 C10 到 (200,350)",
      "在 (800,600) 放一个 GND",
      '添加网络标签 "NET_PGOOD" 在 (1200,300)',
      "删除 R5",
      "查看 U3 的详情",
    ];
    for (const c of cases) {
      const plan = planFromIntent(parseIntent(c), ctx);
      expect(plan.source).toBe("deterministic");
      expect(plan.actions.length).toBe(1);
      const a = plan.actions[0];
      expect(a.tool).toBe("edit_schematic");
      const parsed = editSchematicInputSchema.safeParse(a.args);
      expect(parsed.success, `${c} -> ${JSON.stringify(a.args)}`).toBe(true);
      expect(plan.warnings.length).toBe(0);
    }
  });

  it("delete_component 展开为 delete_object + object_type=component", () => {
    const plan = planFromIntent(parseIntent("删除 R5"), ctx);
    expect(plan.actions[0].args).toMatchObject({
      action: "delete_object",
      object_type: "component",
      designator: "R5",
    });
  });

  it("audit_emc 展开为 emc_audit 且通过 emcAuditInputSchema", () => {
    const plan = planFromIntent(parseIntent("EMC 审计"), ctx);
    expect(plan.actions[0].tool).toBe("emc_audit");
    expect(emcAuditInputSchema.safeParse(plan.actions[0].args).success).toBe(true);
  });

  it("缺少图纸上下文时产出告警而非调用", () => {
    const plan = planFromIntent(parseIntent("删除 R5"), {});
    expect(plan.actions.length).toBe(0);
    expect(plan.warnings.length).toBe(1);
    expect(plan.warnings[0]).toContain("校验");
  });

  it("unknown 意图 → 空动作 + 告警，绝无参数产出", () => {
    const plan = planFromIntent(parseIntent("随便画点什么"), ctx);
    expect(plan.actions.length).toBe(0);
    expect(plan.warnings.length).toBe(1);
  });

  it("参数非法（空网络名）的计划被丢弃并告警", () => {
    const plan = planFromIntent(
      { kind: "label", netName: "", xMils: 1, yMils: 1 },
      ctx,
    );
    expect(plan.actions.length).toBe(0);
    expect(plan.warnings.length).toBe(1);
  });
});

describe("LLM 规划提示词", () => {
  it("动作清单与 editSchematicInputSchema 的枚举完全一致", () => {
    // Robust across zod versions: an invalid action probe makes the enum error
    // message enumerate every accepted value.
    const probe = editSchematicInputSchema.safeParse({
      schematic_full_path: "D:\\p\\s.SchDoc",
      action: "__probe_invalid__",
    });
    expect(probe.success).toBe(false);
    if (probe.success) return;
    const actionMsg = probe.error.issues
      .filter((i) => i.path[0] === "action")
      .map((i) => i.message)
      .join("\n");
    expect(actionMsg.length).toBeGreaterThan(0);
    for (const a of EDIT_SCHEMATIC_ACTIONS) {
      expect(actionMsg, `枚举错误信息应包含 ${a}`).toContain(a);
    }
  });

  it("系统提示词包含动作清单与兜底说明", () => {
    const p = plannerSystemPrompt();
    for (const a of EDIT_SCHEMATIC_ACTIONS) {
      expect(p).toContain(a);
    }
    expect(DETERMINISTIC_FALLBACK_NOTE).toContain("parseIntent");
  });
});
