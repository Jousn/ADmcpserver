import * as z from "zod/v4";

/**
 * Matches schematic_utils SchMcpResolveIncludes tokens (lowercased when parsed in Delphi).
 * Omit include_queries entirely for legacy JSON: { components, drawing_objects } only.
 */
export const schematicIncludeQuerySchema = z.enum([
  "all",
  "sheet",
  "components",
  "wires",
  "buses",
  "net_labels",
  "power_ports",
  "text_labels",
  "junctions",
  "ports",
  "off_sheet_connectors",
  "sheet_symbols",
  "directives",
  "figures",
  "harness",
  "drawing_objects",
]);

export const getSchematicDataInputSchema = z.object({
  schematic_full_path: z
    .string()
    .optional()
    .describe(
      "Absolute path to one .SchDoc that is a logical document of an open project. Use forward or backslashes. Example: D:/Design/Board/Sheet1.SchDoc",
    ),
  project_full_path: z
    .string()
    .optional()
    .describe(
      "Absolute path to an open .PrjPcb or .PrjScr. Required when using schematic_sheet_file_name without a focused project, or to read another open project.",
    ),
  schematic_sheet_file_name: z
    .string()
    .optional()
    .describe(
      "Only the file name of the sheet (e.g. Sheet1.SchDoc). Scope: focused project or project_full_path. Ignored if schematic_full_path is set.",
    ),
  include_queries: z
    .array(schematicIncludeQuerySchema)
    .optional()
    .describe(
      "Filter what to return. Omit for legacy shape { components, drawing_objects }. Use [\"all\"] for every split bucket + sheets[]. Otherwise pick one or more: sheet (size/grids per .SchDoc), components, wires, buses, net_labels, power_ports, text_labels, junctions, ports, off_sheet_connectors, sheet_symbols, directives, figures, harness (placeholder []), drawing_objects (combined primitives as before).",
    ),
});

export type GetSchematicDataInput = z.infer<typeof getSchematicDataInputSchema>;
