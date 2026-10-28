/**
 * LLM planning prompts for the orchestration layer.
 *
 * The deterministic parser (intents.ts) covers short structured commands;
 * these prompts cover everything else. The LLM is asked to output a JSON
 * array of tool calls that the client should validate with the same zod
 * schemas before executing — plus a hard rule to return an empty array
 * when unsure, so the deterministic fallback stays authoritative.
 */

export const EDIT_SCHEMATIC_ACTIONS = [
  "set_component_transform",
  "set_component_parameters",
  "place_component",
  "add_text",
  "add_net_label",
  "add_wire",
  "place_wire",
  "place_net_label",
  "add_bus",
  "add_bus_entry",
  "place_power_port",
  "place_gnd",
  "place_vcc",
  "add_port",
  "add_junction",
  "add_line",
  "add_rectangle",
  "delete_object",
  "draw_plan",
  "get_component_info",
] as const;

export const LLM_RESPONSE_EXAMPLE = `[
  {"tool":"edit_schematic","args":{"action":"place_component","schematic_full_path":"D:\\\\proj\\\\sheet.SchDoc","lib_reference":"Res2","designator":"R1","x_mils":1000,"y_mils":500}},
  {"tool":"edit_schematic","args":{"action":"place_gnd","schematic_full_path":"D:\\\\proj\\\\sheet.SchDoc","x_mils":1000,"y_mils":700}}
]`;

export function plannerSystemPrompt(): string {
  return [
    "你是原理图编辑规划器。把用户的自然语言指令转换为 edit_schematic / emc_audit 工具调用序列。",
    "",
    "硬性规则：",
    "1. 只输出一个 JSON 数组，不要输出任何其他文字、注释或 markdown 代码块标记。",
    "2. 数组每个元素形如 {\"tool\":\"edit_schematic\",\"args\":{...}} 或 {\"tool\":\"emc_audit\",\"args\":{...}}。",
    `3. edit_schematic 的 action 只允许以下值：${EDIT_SCHEMATIC_ACTIONS.join(", ")}。禁止发明新 action 或新字段。`,
    "4. 所有坐标单位是 mils（整数）。位号、网络名必须使用用户或上下文给出的原文，禁止编造。",
    "5. 每个调用必须携带图纸定位（schematic_full_path，或 schematic_sheet_file_name，可加 project_full_path），从上下文取，不要编造路径。",
    "6. 拿不准就输出 []（空数组）并放弃——确定性解析器会兜底，宁缺勿错。",
    "7. emc_audit 无需 action 字段，只需图纸定位字段。",
    "",
    "输出示例：",
    LLM_RESPONSE_EXAMPLE,
  ].join("\n");
}

export function plannerUserPrompt(userText: string, ctxSummary: string): string {
  return `上下文（图纸定位与既有设计状态）：\n${ctxSummary}\n\n用户指令：${userText}`;
}

export const DETERMINISTIC_FALLBACK_NOTE =
  "当 LLM 规划失败、返回非法 JSON 或空数组时：调用方应改用确定性解析（parseIntent + planFromIntent，见 src/orchestration/）。确定性路径只覆盖短命令（放置/移动/旋转/标签/GND/VCC/文本/删除/查询/EMC 审计），复杂绘图请按 STAGE 0-4 范式（见 docs/DEPLOY.md §5）分步执行。";
