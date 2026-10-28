/**
 * Intent → validated tool-call plan expansion.
 *
 * Every generated edit_schematic call is validated against the REAL
 * `editSchematicInputSchema` (same zod schema the tool uses), and emc_audit
 * calls against `emcAuditInputSchema`. Anything that fails validation is
 * dropped into `warnings` instead of being emitted — the plan is either
 * schema-valid or empty, never half-guessed.
 */

import { editSchematicInputSchema } from "../tools/editSchematic.js";
import { emcAuditInputSchema } from "../tools/emcAudit.js";
import type { Intent } from "./intents.js";

export interface PlannedAction {
  tool: "edit_schematic" | "emc_audit";
  args: Record<string, unknown>;
}

export interface Plan {
  /** How this plan was produced — deterministic parser, no LLM involved. */
  source: "deterministic";
  actions: PlannedAction[];
  warnings: string[];
}

export interface PlanContext {
  schematicFullPath?: string;
  projectFullPath?: string;
  schematicSheetFileName?: string;
}

function sheetFields(ctx: PlanContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (ctx.schematicFullPath != null && ctx.schematicFullPath.length > 0) {
    out.schematic_full_path = ctx.schematicFullPath;
  }
  if (ctx.projectFullPath != null && ctx.projectFullPath.length > 0) {
    out.project_full_path = ctx.projectFullPath;
  }
  if (ctx.schematicSheetFileName != null && ctx.schematicSheetFileName.length > 0) {
    out.schematic_sheet_file_name = ctx.schematicSheetFileName;
  }
  return out;
}

function issuesText(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

function editAction(intent: Intent): Record<string, unknown> | null {
  switch (intent.kind) {
    case "place_component":
      return {
        action: "place_component",
        designator: intent.designator,
        lib_reference: intent.libReference,
        x_mils: intent.xMils,
        y_mils: intent.yMils,
        ...(intent.rotationDeg !== undefined ? { rotation_deg: intent.rotationDeg } : {}),
      };
    case "move":
      return {
        action: "set_component_transform",
        designator: intent.designator,
        x_mils: intent.xMils,
        y_mils: intent.yMils,
        ...(intent.rotationDeg !== undefined ? { rotation_deg: intent.rotationDeg } : {}),
      };
    case "rotate":
      return {
        action: "set_component_transform",
        designator: intent.designator,
        rotation_deg: intent.rotationDeg,
      };
    case "label":
      return {
        action: "add_net_label",
        net_name: intent.netName,
        x_mils: intent.xMils,
        y_mils: intent.yMils,
        ...(intent.rotationDeg !== undefined ? { rotation_deg: intent.rotationDeg } : {}),
      };
    case "gnd":
      return { action: "place_gnd", x_mils: intent.xMils, y_mils: intent.yMils };
    case "vcc":
      return {
        action: "place_vcc",
        x_mils: intent.xMils,
        y_mils: intent.yMils,
        ...(intent.netName !== undefined && intent.netName.length > 0
          ? { net_name: intent.netName }
          : {}),
      };
    case "text":
      return { action: "add_text", text: intent.text, x_mils: intent.xMils, y_mils: intent.yMils };
    case "delete_component":
      return { action: "delete_object", object_type: "component", designator: intent.designator };
    case "info":
      return { action: "get_component_info", designator: intent.designator };
    default:
      return null;
  }
}

export function planFromIntent(intent: Intent, ctx: PlanContext): Plan {
  const warnings: string[] = [];
  const actions: PlannedAction[] = [];

  if (intent.kind === "unknown") {
    return {
      source: "deterministic",
      actions,
      warnings: [`无法解析（${intent.reason}）：${intent.raw}`],
    };
  }

  if (intent.kind === "audit_emc") {
    const args = sheetFields(ctx);
    const parsed = emcAuditInputSchema.safeParse(args);
    if (parsed.success) {
      actions.push({ tool: "emc_audit", args: { ...args, ...parsed.data } });
    } else {
      warnings.push(`emc_audit 参数未通过校验（缺图纸定位信息？）：${issuesText(parsed.error)}`);
    }
    return { source: "deterministic", actions, warnings };
  }

  const raw = editAction(intent);
  if (raw === null) {
    return { source: "deterministic", actions, warnings: ["内部错误：未实现的功能类型"] };
  }
  const args = { ...sheetFields(ctx), ...raw };
  const parsed = editSchematicInputSchema.safeParse(args);
  if (parsed.success) {
    actions.push({ tool: "edit_schematic", args: { ...args, ...parsed.data } });
  } else {
    warnings.push(
      `edit_schematic(${String(raw.action)}) 参数未通过校验，已丢弃：${issuesText(parsed.error)}`,
    );
  }
  return { source: "deterministic", actions, warnings };
}
