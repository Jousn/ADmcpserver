import * as z from "zod/v4";

/** Matches schematic_edit.pas SchEditTryParsePowerPortStyle (TPowerObjectStyle). */
export const powerPortStyleSchema = z.enum([
  "circle",
  "arrow",
  "bar",
  "wave",
  "gnd_power",
  "power_ground",
  "gnd_signal",
  "signal_ground",
  "gnd_earth",
  "earth",
]);

const editSchematicActionEnum = z.enum([
  "set_component_transform",
  "set_component_parameters",
  "place_component",
  "add_text",
  "add_net_label",
  "add_wire",
  /** Phase 1 WIRES: alias of add_wire (same bridge + Pascal path). */
  "place_wire",
  /** Phase 1 WIRES: alias of add_net_label. */
  "place_net_label",
  /** Phase 1 WIRES: orthogonal bus polyline (same CSV format as add_wire). */
  "add_bus",
  /** Phase 1 WIRES: single bus entry segment; wire_points_csv must be exactly four numbers. */
  "add_bus_entry",
  /** Phase 2 POWER PORT: explicit style + optional net name / visibility. */
  "place_power_port",
  /** Phase 2: shortcut — default style gnd_power (override with power_port_style). */
  "place_gnd",
  /** Phase 2: shortcut — default style arrow (override with power_port_style). */
  "place_vcc",
  "add_port",
  "add_junction",
  "add_line",
  "add_rectangle",
  /** Delete objects by type with point/area/designator targeting (verified: RemoveSchObject + RobotManager pattern from DeleteSchObjects.pas). */
  "delete_object",
  /**
   * Batch draw for tool-driven pipelines: component transforms + optional
   * delete-all-wires + wire polylines + junctions in ONE bridge call.
   * Prefer wire_pins (topology in, routed wires out) over hand-built draw_plan calls.
   */
  "draw_plan",
  "get_component_info",
]);

export const editSchematicInputSchema = z
  .object({
    action: editSchematicActionEnum,
    schematic_full_path: z.string().optional(),
    project_full_path: z.string().optional(),
    schematic_sheet_file_name: z.string().optional(),
    designator: z.string().optional(),
    x_mils: z.number().optional(),
    y_mils: z.number().optional(),
    rotation_deg: z.number().optional(),
    lib_reference: z.string().optional(),
    /**
     * place_component only: place so that THIS PIN's hotspot lands exactly on
     * (x_mils, y_mils) instead of the component origin — absorbs AD's
     * origin-pivot rotation swings. Resolved server-side from library pin
     * tables before the bridge call.
     */
    anchor_pin: z.string().optional(),
    sch_library_path: z.string().optional(),
    parameter_names: z.array(z.string()).optional(),
    parameter_values: z.array(z.string()).optional(),
    text: z.string().optional(),
    net_name: z.string().optional(),
    wire_points_csv: z.string().optional(),
    power_port_style: powerPortStyleSchema.optional(),
    show_net_name: z.boolean().optional(),
    port_name: z.string().optional(),
    io_type: z.string().optional(),
    port_style: z.string().optional(),
    x1_mils: z.number().optional(),
    y1_mils: z.number().optional(),
    x2_mils: z.number().optional(),
    y2_mils: z.number().optional(),
    is_solid: z.boolean().optional(),
    object_type: z.string().optional(),
    delete_all: z.boolean().optional(),
    /** Endpoint snap tolerance in mils for add_wire (default 20; 0 disables; max 50). */
    snap_tolerance_mils: z.number().optional(),
    /** draw_plan: component transforms, semicolon-separated "DES;x;y;rot" per item. */
    transforms_csv: z.array(z.string()).optional(),
    /** draw_plan: wire polylines, semicolon-separated "x1;y1;x2;y2;..." per item (exact coordinates, NO snapping). */
    wires_csv: z.array(z.string()).optional(),
    /** draw_plan: junction dots, "x;y" per item. */
    junctions_csv: z.array(z.string()).optional(),
    /** draw_plan: delete every wire AND junction on the sheet before drawing. */
    delete_wires_all: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const hasSheet =
      (val.schematic_full_path != null && val.schematic_full_path.length > 0) ||
      (val.schematic_sheet_file_name != null && val.schematic_sheet_file_name.length > 0);
    if (!hasSheet) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide schematic_full_path or schematic_sheet_file_name to identify the .SchDoc.",
        path: ["schematic_full_path"],
      });
    }

    switch (val.action) {
      case "set_component_transform": {
        if (val.designator == null || val.designator === "") {
          ctx.addIssue({
            code: "custom",
            message: "designator is required.",
            path: ["designator"],
          });
        }
        if (
          val.x_mils === undefined &&
          val.y_mils === undefined &&
          val.rotation_deg === undefined
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Provide at least one of x_mils, y_mils, rotation_deg.",
            path: ["x_mils"],
          });
        }
        break;
      }
      case "set_component_parameters": {
        if (val.designator == null || val.designator === "") {
          ctx.addIssue({
            code: "custom",
            message: "designator is required.",
            path: ["designator"],
          });
        }
        const n = val.parameter_names;
        const v = val.parameter_values;
        if (n == null || v == null || n.length === 0) {
          ctx.addIssue({
            code: "custom",
            message:
              "parameter_names and parameter_values (non-empty, same length) are required.",
            path: ["parameter_names"],
          });
        } else if (n.length !== v.length) {
          ctx.addIssue({
            code: "custom",
            message: "parameter_names and parameter_values must have the same length.",
            path: ["parameter_values"],
          });
        }
        break;
      }
      case "place_component": {
        if (val.lib_reference == null || val.lib_reference === "") {
          ctx.addIssue({
            code: "custom",
            message: "lib_reference is required.",
            path: ["lib_reference"],
          });
        }
        if (val.designator == null || val.designator === "") {
          ctx.addIssue({
            code: "custom",
            message: "designator is required.",
            path: ["designator"],
          });
        }
        if (val.x_mils === undefined || val.y_mils === undefined) {
          ctx.addIssue({
            code: "custom",
            message: "x_mils and y_mils are required for place_component.",
            path: ["x_mils"],
          });
        }
        break;
      }
      case "add_text": {
        if (val.text == null || val.text === "") {
          ctx.addIssue({ code: "custom", message: "text is required.", path: ["text"] });
        }
        if (val.x_mils === undefined || val.y_mils === undefined) {
          ctx.addIssue({
            code: "custom",
            message: "x_mils and y_mils are required.",
            path: ["x_mils"],
          });
        }
        break;
      }
      case "add_net_label":
      case "place_net_label": {
        if (val.net_name == null || val.net_name === "") {
          ctx.addIssue({
            code: "custom",
            message: "net_name is required.",
            path: ["net_name"],
          });
        }
        if (val.x_mils === undefined || val.y_mils === undefined) {
          ctx.addIssue({
            code: "custom",
            message: "x_mils and y_mils are required.",
            path: ["x_mils"],
          });
        }
        break;
      }
      case "add_wire":
      case "place_wire": {
        if (val.wire_points_csv == null || val.wire_points_csv === "") {
          ctx.addIssue({
            code: "custom",
            message: "wire_points_csv is required.",
            path: ["wire_points_csv"],
          });
        }
        break;
      }
      case "add_bus": {
        if (val.wire_points_csv == null || val.wire_points_csv === "") {
          ctx.addIssue({
            code: "custom",
            message: "wire_points_csv is required for add_bus (same format as add_wire).",
            path: ["wire_points_csv"],
          });
        }
        break;
      }
      case "add_bus_entry": {
        const csv = val.wire_points_csv?.trim() ?? "";
        if (csv === "") {
          ctx.addIssue({
            code: "custom",
            message:
              "wire_points_csv is required for add_bus_entry: exactly four numbers x1,y1,x2,y2 (mils) for one segment.",
            path: ["wire_points_csv"],
          });
          break;
        }
        const parts = csv.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
        if (parts.length !== 4) {
          ctx.addIssue({
            code: "custom",
            message:
              "add_bus_entry: wire_points_csv must contain exactly four comma-separated numbers (x1,y1,x2,y2 in mils).",
            path: ["wire_points_csv"],
          });
          break;
        }
        for (let i = 0; i < 4; i++) {
          const n = Number(parts[i]);
          if (!Number.isFinite(n)) {
            ctx.addIssue({
              code: "custom",
              message: `add_bus_entry: value at position ${i + 1} is not a finite number: ${parts[i]}`,
              path: ["wire_points_csv"],
            });
            break;
          }
        }
        break;
      }
      case "place_power_port": {
        if (val.power_port_style == null) {
          ctx.addIssue({
            code: "custom",
            message: "power_port_style is required for place_power_port.",
            path: ["power_port_style"],
          });
        }
        if (val.x_mils === undefined || val.y_mils === undefined) {
          ctx.addIssue({
            code: "custom",
            message: "x_mils and y_mils are required.",
            path: ["x_mils"],
          });
        }
        break;
      }
      case "place_gnd":
      case "place_vcc": {
        if (val.x_mils === undefined || val.y_mils === undefined) {
          ctx.addIssue({
            code: "custom",
            message: "x_mils and y_mils are required.",
            path: ["x_mils"],
          });
        }
        break;
      }
      case "add_port": {
        if (val.port_name == null || val.port_name === "") {
          ctx.addIssue({ code: "custom", message: "port_name is required.", path: ["port_name"] });
        }
        if (val.x_mils === undefined || val.y_mils === undefined) {
          ctx.addIssue({ code: "custom", message: "x_mils and y_mils are required.", path: ["x_mils"] });
        }
        break;
      }
      case "add_junction": {
        if (val.x_mils === undefined || val.y_mils === undefined) {
          ctx.addIssue({ code: "custom", message: "x_mils and y_mils are required.", path: ["x_mils"] });
        }
        break;
      }
      case "add_line":
      case "add_rectangle": {
        if (val.x1_mils === undefined || val.y1_mils === undefined || val.x2_mils === undefined || val.y2_mils === undefined) {
          ctx.addIssue({ code: "custom", message: "x1_mils, y1_mils, x2_mils, y2_mils are required.", path: ["x1_mils"] });
        }
        break;
      }
      case "delete_object": {
        if (val.object_type == null || val.object_type === "") {
          ctx.addIssue({
            code: "custom",
            message:
              "object_type is required (wire|bus|bus_entry|net_label|power_port|junction|port|text|line|rectangle|component).",
            path: ["object_type"],
          });
          break;
        }
        const hasPoint =
          val.x_mils !== undefined && val.y_mils !== undefined;
        const hasArea =
          val.x1_mils !== undefined &&
          val.y1_mils !== undefined &&
          val.x2_mils !== undefined &&
          val.y2_mils !== undefined;
        const isComponent = val.object_type === "component";
        const hasTarget =
          (isComponent && val.designator != null && val.designator !== "") ||
          (!isComponent && (hasPoint || hasArea || val.delete_all === true));
        if (!hasTarget) {
          ctx.addIssue({
            code: "custom",
            message: isComponent
              ? "designator is required to delete a component."
              : "Provide a target: x_mils+y_mils (point, ±25 mil box), x1/y1/x2/y2 (area), or delete_all=true.",
            path: ["designator"],
          });
        }
        break;
      }
      case "draw_plan": {
        const hasContent =
          (val.transforms_csv?.length ?? 0) > 0 ||
          (val.wires_csv?.length ?? 0) > 0 ||
          (val.junctions_csv?.length ?? 0) > 0 ||
          val.delete_wires_all === true;
        if (!hasContent) {
          ctx.addIssue({
            code: "custom",
            message:
              "draw_plan needs at least one of transforms_csv, wires_csv, junctions_csv, delete_wires_all.",
            path: ["action"],
          });
        }
        if (val.snap_tolerance_mils !== undefined && (val.snap_tolerance_mils < 0 || val.snap_tolerance_mils > 60)) {
          ctx.addIssue({
            code: "custom",
            message: "snap_tolerance_mils must be between 0 and 60.",
            path: ["snap_tolerance_mils"],
          });
        }
        break;
      }
      case "get_component_info": {
        if (val.designator == null || val.designator === "") {
          ctx.addIssue({ code: "custom", message: "designator is required.", path: ["designator"] });
        }
        break;
      }
      default:
        break;
    }
  });

export type EditSchematicInput = z.infer<typeof editSchematicInputSchema>;
