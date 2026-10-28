/**
 * Orchestration layer: natural language → validated edit_schematic / emc_audit
 * call plans. Two cooperating paths:
 *
 *  - deterministic: parseIntent() + planFromIntent() — no LLM, pattern-based,
 *    every output validated against the real tool zod schemas;
 *  - LLM: prompts in prompts.ts — for fuzzy commands, output must be
 *    validated by the client with the same schemas (see DETERMINISTIC_FALLBACK_NOTE).
 */

export { parseIntent } from "./intents.js";
export type { Intent } from "./intents.js";
export { planFromIntent } from "./planner.js";
export type { Plan, PlanContext, PlannedAction } from "./planner.js";
export {
  EDIT_SCHEMATIC_ACTIONS,
  DETERMINISTIC_FALLBACK_NOTE,
  LLM_RESPONSE_EXAMPLE,
  plannerSystemPrompt,
  plannerUserPrompt,
} from "./prompts.js";
