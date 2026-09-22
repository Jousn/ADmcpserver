import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/** Live Altium queries: no design changes, safe to retry. */
export const annotationsReadOnlyLive: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
};

/** Writes ~/.altium-mcp/config.json only. */
export const annotationsConfigWrite: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
};

/** Node-only; no Altium process. */
export const annotationsNodeOnly: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
};

/** Schematic edits: modifies open .SchDoc data (save in Altium as needed). */
export const annotationsSchematicEdit: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
};

/** PCB edits: modifies open .PcbDoc data (placement, classes, visibility). */
export const annotationsPcbWrite: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
};

/** Output generation: produces files on disk (Gerber, BOM, etc.). */
export const annotationsOutputGenerate: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
};

export const DESCRIPTION_GET_SERVER_STATUS = `
Purpose: Check MCP + Altium bridge setup.
Parameters: None.
Returns: JSON { platform, workspaceRoot, altiumExeFound, scriptProjectFound, bundledScriptsDir, bridgeLastError, diagnosticsHint, env }.
Note: Triggers script bundle sync. Fix paths before live tools if exe/script not found.
`.trim();

export const DESCRIPTION_CONFIGURE_ALTIUM_EXE = `
Purpose: Save Altium X2.EXE path to config.
Parameters: path (string, required) — absolute path to X2.EXE.
Returns: { ok, altiumExePath }.
`.trim();

export const DESCRIPTION_ALTIUM_PING = `
Purpose: Verify DelphiScript bridge responds inside Altium.
Parameters: None.
Returns: { success, result: { protocolVersion, pong } }.
`.trim();

export const DESCRIPTION_GET_WORKSPACE_PROJECTS = `
Purpose: List open workspace entries (projects + documents).
Parameters: None.
Returns: JSON { projectCount, focusedProjectFullPath, projects[].{ index, projectFullPath, projectFileName, documents[].{ kind, fullPath, fileName } } }.
Note: Includes non-design entries (Free Documents, AltiumScript).
`.trim();

export const DESCRIPTION_GET_SCHEMATIC_DATA = `
Purpose: Export schematic sheet data with optional filtering.
Parameters (all optional):
- schematic_full_path: absolute .SchDoc path (preferred)
- project_full_path: absolute .PrjPcb/.PrjScr path
- schematic_sheet_file_name: file name only (e.g. Sheet1.SchDoc)
- include_queries: string[] filter. Supported: sheet|components|wires|buses|net_labels|power_ports|text_labels|junctions|ports|off_sheet_connectors|sheet_symbols|directives|figures|harness|drawing_objects|all. Omit = legacy { components, drawing_objects }.
Returns: Filtered JSON arrays per requested bucket. Coordinates in mils.
Note: schematic_full_path wins > project_full_path+sheet > focused project. Use this as the MANDATORY verification step after edit_schematic drawing: fetch wires+power_ports+net_labels, then check every wire endpoint against pin coordinates (from get_component_info) and every component pin for coverage — unconnected pins or endpoints matching nothing mean the drawing is WRONG even though every add_wire call succeeded.
`.trim();

export const DESCRIPTION_CHECK_CONNECTIVITY = `
Purpose: Electrical connectivity audit of a schematic sheet — the MANDATORY machine verification after wiring. Compiles the project (authoritative: per-pin flattened net names from the Altium compiler, same data model as the official Connectivity.pas example) and combines it with geometric wire data. Reports:
- Errors (must fix before reporting success):
  - SHORT_ACROSS_COMPONENT: pins of the SAME component share one net — the part is shorted by wiring (classic bug: a wire runs through a vertical 2-pin part like Res1 rotated 90°, touching both pin hotspots; the wire must terminate at ONE pin, never pass through the part)
  - POWER_NET_SHORT: different power nets (e.g. VCC and GND) electrically merged
  - FLOAT_PIN: compiler reports the pin on no net ('?') — nothing touches it
- Warnings (compiler does not check these): T_CONTACT_NO_JUNCTION (wire ends on another wire mid-span without a junction dot), DANGLING_WIRE_ENDPOINT, LABEL_NOT_ON_WIRE
- nets[]: every electrical net with its pin members ("R1.1", "Q1.C", ...) — compare against your planned pin-coverage table
Parameters (all optional, same sheet scoping as get_schematic_data):
- schematic_full_path | project_full_path + schematic_sheet_file_name
Returns: { ok, data_source ("compiled-dm" | "geometry-fallback"), summary { pins_total, pins_connected, pins_floating, wires, nets, errors, warnings }, nets[], errors[], warnings[] }.
ok=true with pins_floating=0 means every pin is on a net and no shorts/merges exist. If data_source is "geometry-fallback", net verdicts are heuristic — compile first and retry.
`.trim();

export const DESCRIPTION_ANALYZE_SCHEMATIC_QUALITY = `
Purpose: PREDICTIVE drawing-quality analysis of a schematic sheet — evaluate how a layout WILL look BEFORE drawing it (read-only, nothing is modified). Use BEFORE edit_schematic placement/wiring decisions and BEFORE rotating components; pair with check_connectivity (which verifies electrical correctness — this tool verifies routing QUALITY).
- current.actual_wires: crossings between different-net wires, total bends, total wire length, wire-through-component-body hits, worst per-net detour ratios (actual/MST — values >> 1 mean sprawling nets)
- current.estimated: layout simulator baseline on current pins (per net: Manhattan MST + L-routed edges)
- hypothetical (if transforms[] given): simulates moving/rotating components in memory (pin offsets rotated about component origin) and returns the SAME estimator on the new pin layout — compare delta (negative = better) before committing
- rotation_suggestions: every component is tried at 0/90/180/270° in the simulator; rotations that improve the estimated score are listed with expected improvement (the classic case: a polarized 2-pin cap whose pins face away from the rails — 180° rotation makes the connection direct)
Electrical correctness is NEVER judged here — the netlist (pin-to-net) is treated as invariant; run check_connectivity for shorts/floats.
Parameters (all optional, same sheet scoping as get_schematic_data):
- schematic_full_path | project_full_path + schematic_sheet_file_name
- transforms: [{ designator, x_mils?, y_mils?, rotation_deg? }] — hypothetical transforms to simulate
- suggest_rotations: boolean (default true) — auto-try all 4 rotations per component
Returns: { data_source, sheet_summary, current { actual_wires, estimated }, hypothetical? { estimated, delta }, rotation_suggestions[], notes[] }. Score = 10*crossings + bends + 3*obstacle_hits + length/100 (lower is better). Applying a suggestion: edit_schematic set_component_transform -> get_component_info (NEW pin coords) -> rewire -> check_connectivity.
`.trim();

export const DESCRIPTION_PIN_TABLE = `
Purpose: Pin definitions for library symbols BEFORE placement — the planning input for stage 1 (selection + netlist design). Returns, per lib_reference: every pin's number, name, electrical type (eElectricInput/Output/IO/Power/Passive...), orientation (0/90/180/270, direction the pin extends out from the body), location, length, and the derived FREE-END hotspot offset (hotspot_dx/dy — where a wire must land, same math as get_component_info uses on placed parts).
When to use: BEFORE writing the netlist, call once with all the symbols you intend to use (e.g. ["Res1","Cap","LED0","SW-PB"]). Design connections against REAL pin numbers/names/types from this table — never from memory or datasheet guesses. Power pins (eElectricPower) belong on VCC/GND-style nets. Orientation is per-symbol (do NOT assume 2-pin symbols are horizontal — check orientation_deg before planning rotations).
Parameters:
- lib_references (string[], required, 1-40): symbol names, case-insensitive.
Returns: { ok, matched_count, components[] { lib_reference, description, default_designator, part_count, library_name, pins[] { number, name, electrical_type, orientation_deg, x, y, pin_length_mils, owner_part_id, hotspot_dx, hotspot_dy } }, unmatched?[] }.
Note: searches the FOCUSED project's .SchLib files. Symbols not in a project library (e.g. installed .IntLib only) are not visible — place one instance and read pins back with edit_schematic get_component_info for those.
`.trim();

export const DESCRIPTION_VALIDATE_NETLIST = `
Purpose: Machine validation of the GOLDEN NETLIST (stage-1 deliverable) BEFORE placing components or drawing wires. The netlist is the single source of truth for the whole pipeline (wire_pins member lists, check_connectivity partition comparison), so validate it first and freeze it.
Detects (pin-table mode, default — checks against real library pin definitions via the focused project's .SchLib files):
- PIN_NOT_ON_COMPONENT: hallucinated/mistyped pin (e.g. U1.14 on a part with 12 pins) — the #1 LLM netlist failure
- PIN_IN_MULTIPLE_NETS: one pin on two nets = short by construction
- PIN_UNASSIGNED (strict_pin_coverage, default ON): a pin in NO net and NOT in no_connect — the forgotten-net bug (a base-drive pin nobody routed floats as an isolated island). Fix by adding the net or listing the pin in no_connect.
- PIN_NC_AND_NETTED: pin declared no_connect while also in a net
- POWER_PIN_OFF_POWER_NET: eElectricPower pin stuck on a signal net
- POWER_NET_NO_POWER_PIN: power-looking net with no power pins (double-check intent)
Syntax mode (fallback when libraries unavailable): pin format (DES.PIN), pins referencing undeclared designators, duplicate designators/net names/pin entries, empty and single-pin nets, naming conventions. Coverage strictness requires pin tables (no pin universe in syntax mode).
Parameters:
- components (required): [{ designator, lib_reference }] — the BOM
- nets (required): [{ name, pins: ["R1.2", "D1.1", ...] }] — every net with its FULL member list
- no_connect (string[]?, optional): pins explicitly NOT connected, e.g. ["U1.7"] — in strict mode every pin must be netted or listed here
- strict_pin_coverage (boolean?, default true): unassigned pin = ERROR (false downgrades to a note)
- check_pin_tables (boolean?, default true): false = syntax-only, no Altium access
Returns: { ok, mode, strict_pin_coverage, errors[], warnings[], pin_coverage { components, distinct_pins, assigned_pins, no_connect_pins, unassigned_by_component[] }, power_nets[], nets[], frozen_netlist { components, nets, no_connect }, notes[], next_step? }.
Workflow: validate_netlist -> ok=true freezes the netlist -> place components (coarse blocks) -> wire_pins per net -> check_connectivity (partition must match frozen_netlist).
`.trim();

export const DESCRIPTION_DESIGN_LEDGER = `
Purpose: EXTERNAL design state — the cure for "context loses constraints" over long sessions. Persists the authoritative pipeline artifacts on disk, keyed by schematic: the STAGE-0 plan (block map, rail map), the placement table (pin-target semantics + facing rationales), the FROZEN netlist, progress (components placed / nets wired), and open issues. Constraints live on disk, so no session length or context compaction can lose them.
Discipline (mandatory): LOAD before starting or resuming ANY stage; SAVE after EVERY stage. After load, use the ledger's netlist/placement/rails — NOT conversation memory.
Review built in on both ends:
- save: syntax-level netlist lint + discipline warnings (placements without facing rationale, no anchor_pin usage)
- load/status: a review digest — pending placements, pending nets, stale progress, stage contradictions (stage=verified with unwired nets), missing netlist
Actions:
- save (state required): persist; returns the review digest of what was saved
- load: full state + review digest — re-anchor everything from this
- status: review digest only (light check)
- list: all ledgers (name, stage, updated)
- delete: remove a ledger
Parameters:
- action (required): save | load | status | list | delete
- schematic_full_path (required except list): the ledger key
- state (required for save): { design_name, description?, stage?, block_map?, rail_map?, placement? [{designator, lib_reference, anchor_pin?, x_mils, y_mils, rotation_deg, why}], netlist? {components, nets, no_connect?}, progress? {components_placed?, nets_wired?, verification?}, open_issues? }
- note (optional): history annotation for save
Returns: { ok, action, ...state/review as per action }. Files live under ~/.altium-mcp/ledgers/. Pure Node — no Altium needed.
`.trim();

export const DESCRIPTION_INSTANTIATE_MODULE = `
Purpose: ONE-CALL generation of a company-standard circuit block on a sheet — the template-to-drawing link for SERIES schematic design. You supply template name + origin + optional parameter overrides; the tool validates symbols/pins against the library (fail-fast, zero side effects on mismatch), auto-allocates designators that never collide with existing components, places parts per the template's layout convention, wires every template net via wire_pins (real pin hotspots, obstacle-avoiding routing, auto junctions), places GND/VCC ports and net labels on interface nets, writes component values from params, and verifies the compiled netlist contains every module net with exactly the planned pin membership.
When to use: series design workflow — call list_module_templates to see blocks, instantiate each block at its planned origin (blocks side by side, >=2000 mil apart), then wire inter-block interfaces manually or via wire_pins. Multiple instances of the same template just work (designators auto-allocate).
Parameters:
- template (string, required): template name from list_module_templates.
- origin_x_mils / origin_y_mils (int, required): module origin; the template's layout offsets are relative to this.
- params (object?, optional): parameter overrides, e.g. {"c_bulk_uf": 220}. Unknown keys are errors (typos must not pass silently).
- schematic_full_path | project_full_path + schematic_sheet_file_name (sheet scoping).
- verify (boolean?, default true): compile + subset-check the module nets afterwards.
Returns: { ok, components_placed[] {slot, designator, x, y, rotation}, values_set, params_used, nets[] {net, pins, wires_drawn, ok}, verification? { all_module_nets_compiled, checks[] } }.
Preflight failures return { ok:false, stage:"preflight", issues[] } with NOTHING drawn. Requires the project owning the .SchLib files to be open (pin tables). Does not auto-save.
`.trim();

export const DESCRIPTION_LIST_MODULE_TEMPLATES = `
Purpose: List available module templates (templates/*.json) — the company's standardized circuit blocks for series schematic generation. Returns per template: name, category, description, component/net/param counts, and default parameter values. Read-only, no Altium access.
When to use: at the start of a series design to see which blocks exist; after adding a new template JSON to the templates/ directory to confirm it loads and validates.
Returns: { ok, count, templates[] { name, category, description, components, nets, params[] } }.
`.trim();

export const DESCRIPTION_EDIT_SCHEMATIC = `
Purpose: Edit schematic via action-based single tool.
Parameters:
- action (required): set_component_transform | set_component_parameters | place_component | add_text | add_net_label | add_wire | add_bus | add_bus_entry | place_power_port | place_gnd | place_vcc | add_port | add_junction | add_line | add_rectangle | delete_object | draw_plan | get_component_info
- schematic_full_path OR (project_full_path + schematic_sheet_file_name)
- Per action:
  - set_component_transform: designator, x_mils?, y_mils?, rotation_deg? (snap 0/90/180/270)
  - set_component_parameters: designator, parameter_names[], parameter_values[] (same length)
  - place_component: lib_reference, designator, x_mils, y_mils, rotation_deg? (quarter-turn 0/90/180/270), sch_library_path? — places a full library part (with pins/footprint) via the IntegratedLibrary:PlaceLibraryComponent process. sch_library_path: absolute path to a project .SchLib or an installed library name (e.g. "Miscellaneous Devices.IntLib"); omit to let Altium search installed libraries. The target sheet must belong to an open project (it is focused automatically). Response returns the ACTUAL placed designator and position — verify and use them (Altium may reassign designator if taken).
  - add_text: text, x_mils, y_mils
  - add_net_label: net_name, x_mils, y_mils, rotation_deg?
  - add_wire: wire_points_csv (comma-separated mils pairs, e.g. "0,0,1000,0,1000,500"), snap_tolerance_mils? (default 20, 0 disables, max 50). SERVER-SIDE SNAPPING: the polyline's first and last points snap to the nearest pin hotspot / power port within the tolerance, all other points are grid-rounded to 10 mils — small coordinate errors no longer float the wire. The response reports the ACTUAL drawn coordinates (points_csv) and every snap applied (snapped[]). PREFER wire_pins for net-to-net connections: it reads pin coordinates itself and routes around obstacles.
  - add_bus: same as add_wire format (no pin snapping — bus terminators use bus entries)
  - add_bus_entry: wire_points_csv (exactly 4 numbers: x1,y1,x2,y2)
  - place_power_port: power_port_style (circle|arrow|bar|wave|gnd_power|power_ground|gnd_signal|signal_ground|gnd_earth|earth), x_mils, y_mils, net_name?, rotation_deg?, snap_tolerance_mils? (default 25, 0 disables) — the port position snaps to the nearest pin hotspot / port so it cannot float beside its pin; response reports the final x/y and snapped_to target.
  - place_gnd: x_mils, y_mils, net_name?, snap_tolerance_mils? (defaults: style=gnd_power, net=GND, snap 25)
  - place_vcc: x_mils, y_mils, net_name?, snap_tolerance_mils? (defaults: style=arrow, net=VCC, snap 25)
  - add_port: port_name, x_mils, y_mils, rotation_deg?, io_type? (input|output|bidirectional|unspecified), style? (left|right|leftright|none)
  - add_junction: x_mils, y_mils
  - add_line: x1_mils, y1_mils, x2_mils, y2_mils
  - add_rectangle: x1_mils, y1_mils, x2_mils, y2_mils, is_solid? (true|false)
  - delete_object: object_type (wire|bus|bus_entry|net_label|power_port|junction|port|text|line|rectangle|component), then target it ONE of three ways: designator (component only) | x_mils+y_mils (point — deletes objects of that type within ±25 mils) | x1_mils+y1_mils+x2_mils+y2_mils (area rectangle) | delete_all=true (ALL objects of that type on the sheet — use only for full redraws). Returns deleted_count.
  - draw_plan: batch pipeline action (one bridge call): transforms_csv[] ("DES;x;y;rot"), delete_wires_all? (removes ALL wires+junctions first), wires_csv[] ("x1;y1;x2;y2;..." polylines with EXACT coordinates — no snapping), junctions_csv[] ("x;y"). NOTE: items are SEMICOLON-separated because the bridge strips commas from array lines. Normally called by wire_pins / optimize_layout — hand-build only for full redraws.
  - get_component_info: designator — returns full component details (comment, description, lib_reference, parameters[], pins[] with name, designator, electrical_type, is_hidden, x_mils, y_mils, pin_length_mils, orientation_deg). IMPORTANT: pins x_mils/y_mils are the ELECTRICAL CONNECTION POINTS (the free end of each pin's wire, already offset from the component body by the pin length) — use these EXACT coordinates as wire endpoints. Components carry their own pin wires (100/200 mil long); wires landing on the pin's body side do NOT connect.
Returns: Bridge JSON with action, sheet, details.
Note: Does not auto-save. After wiring, ALWAYS verify with check_connectivity before reporting success — a successful add_wire call only means the object was created, not that it connects to anything. Aliases: place_net_label=add_net_label, place_wire=add_wire.
`.trim();

export const DESCRIPTION_WIRE_PINS = `
Purpose: Connect the pins of ONE net with orthogonal, obstacle-avoiding wires — the preferred way to wire a schematic. You supply TOPOLOGY (which pins belong to the net); the tool reads the actual pin hotspots from Altium, plans Manhattan routes that avoid foreign-net wires and pins (net-aware A* on a mils grid, promoted from the verified fixAndApply router), auto-places junction dots at same-net T-contacts, draws everything in ONE bridge call, and verifies the result. You never handle coordinates.
When to use: after place_component, call once per net (VCC, GND, LED1, ...) with its full pin list. Power ports/net labels: place them separately (place_gnd/place_vcc/add_net_label) — they snap to pin hotspots automatically.
Parameters:
- net_name (string, required): the net being drawn (e.g. VCC, GND, SDA). Same-name existing wires/ports are joinable; everything else is an obstacle.
- pins (string[], required, min 2): pins to interconnect, as "DESIGNATOR.pin", e.g. ["R1.2", "D1.1"]. Every pin must already be placed on the sheet.
- schematic_full_path | project_full_path + schematic_sheet_file_name (sheet scoping)
- verify (boolean?, default true): re-audit after drawing; confirms all listed pins landed on one net.
Returns: { ok, net_name, wires_drawn, junctions_drawn, endpoints[], wires[] (polylines actually drawn — ground truth for follow-up edits), verification? { all_pins_on_one_net, actual_net_name, still_floating[], audit_summary, audit_errors, audit_warnings } }.
Notes: wires land EXACTLY on pin hotspots (coordinates read back from Altium, not model arithmetic). If routing is impossible (fully boxed-in pin) the call fails BEFORE drawing anything. Does not auto-save.
`.trim();

export const DESCRIPTION_OPTIMIZE_LAYOUT = `
Purpose: One-shot placement + rewiring quality optimization of a wired schematic sheet — makes drawings LOOK better (fewer crossings/bends/shorter wires) with the netlist guaranteed unchanged. Runs the verified hill-climb + net-aware rewire pipeline (optimizePlacement: score 594->292 on the reference sheet, netlist identical): (1) in-memory hill climb over per-component rotations and ±100/200/300 mil moves with component-overlap constraints, scored by the same estimator as analyze_schematic_quality; (2) applies the winning transforms; (3) re-reads REAL pin positions, deletes all wires, re-routes every net from scratch with the A* router; (4) auto junction dots; (5) verifies the compiled netlist partition is IDENTICAL to before.
When to use: after the circuit is wired and check_connectivity is clean, as the final polish step. Requires compiled net data (DM layer) — run compile_project first if check_connectivity reports geometry-fallback.
Parameters:
- schematic_full_path | project_full_path + schematic_sheet_file_name (sheet scoping)
- max_sweeps (int?, default 12, 1-40): hill-climb budget; stops early at a local optimum.
- apply (boolean?, default true): false = report the planned transforms only, modify nothing.
- verify (boolean?, default true): re-audit and compare netlist partitions after applying.
Returns: { ok, estimated_score { before, after }, sweeps_used, converged, transforms_planned[], applied, wires_drawn, junctions_drawn, verification? { netlist_partition_identical, audit_summary, audit_errors, estimated_score_now, actual_wires_now } }.
Safety: if rewire planning fails after transforms were applied, the sheet is automatically RESTORED to its pre-optimization state (original transforms + wires + junctions) and the error is reported. If verification reports netlist_partition_identical=false, DO NOT SAVE — use Altium Undo. Does not auto-save.
`.trim();

export const DESCRIPTION_GET_PCB_LAYERS = `
Purpose: List electrical/mechanical layer metadata for active PCB.
Parameters: None.
Returns: JSON layer list with names, kinds, visibility.
`.trim();

export const DESCRIPTION_GET_PCB_RULES = `
Purpose: List PCB design rules.
Parameters: None.
Returns: JSON rule descriptors (name, kind, scope).
`.trim();

export const DESCRIPTION_GET_ALL_NETS = `
Purpose: List unique net names on active PCB.
Parameters: None.
Returns: String[] of net names.
`.trim();

export const DESCRIPTION_GET_PCB_LAYER_STACKUP = `
Purpose: Physical layer stackup (dielectrics, thickness).
Parameters: None.
Returns: JSON stackup structure.
`.trim();

export const DESCRIPTION_GET_ALL_DESIGNATORS = `
Purpose: All component reference designators on active PCB.
Parameters: None.
Returns: String[] designators.
`.trim();

export const DESCRIPTION_GET_COMPONENT_PINS = `
Purpose: Pin-level data for specified components with full pad properties from PCBObjectInspector.
Parameters: designators (string[], required, min 1).
Returns: JSON pin info per designator including:
  - name, net, x (mils), y (mils), rotation, layer
  - mode: ePadMode_Simple|ePadMode_LocalExternal|ePadMode_External
  - Per-layer sizes: top_x_size_mils, top_y_size_mils, mid_x_size_mils, mid_y_size_mils, bot_x_size_mils, bot_y_size_mils
  - Per-layer shapes: top_shape, mid_shape, bot_shape (eRounded|eRectangular|eOctagonal|eCircleShape|eArc)
  - Hole info: hole_size_mils, plated, drill_type, hole_type
  - Tenting: is_tenting, is_tenting_top, is_tenting_bottom
  - Testpoints: is_testpoint_top, is_testpoint_bottom, is_assy_testpoint_top, is_assy_testpoint_bottom
  - Mask expansions: solder_mask_expansion_mils, paste_mask_expansion_mils
  - Plane connection: power_plane_connect_style (eDirectConnect|eReliefConnect|eNoConnect), relief_conductor_width_mils, relief_entries, relief_air_gap_mils, power_plane_clearance_mils, power_plane_relief_expansion_mils
  - pin_package_length_mils, unique_id
`.trim();

export const DESCRIPTION_FILE_MODE_CAPABILITIES = `
Purpose: Report offline file-mode features.
Parameters: None.
Returns: JSON capability flags (Node only, no Altium).
`.trim();

export const DESCRIPTION_GET_SELECTED_COMPONENTS = `
Purpose: Get coordinates of currently selected PCB components.
Parameters: None.
Returns: JSON[] { designator, x, y, rotation }. Empty if nothing selected.
Note: User must select components in Altium PCB editor first.
`.trim();

export const DESCRIPTION_SET_COMPONENT_POSITION = `
Purpose: Move single PCB component to absolute position.
Parameters:
- designator (string, required)
- x (number, required): mils
- y (number, required): mils
- rotation (number?, optional): degrees, omit to keep current
Returns: Bridge JSON confirming new position.
`.trim();

export const DESCRIPTION_MOVE_COMPONENTS = `
Purpose: Batch move PCB components by relative offset.
Parameters:
- designators (string[], required)
- x_offset (number, required): mils
- y_offset (number, required): mils
- rotation (number?, optional): degrees, default 0
Returns: JSON with moved count.
`.trim();

export const DESCRIPTION_CREATE_NET_CLASS = `
Purpose: Create net class and add nets. If class exists, only adds new members.
Parameters:
- class_name (string, required)
- net_names (string[], required)
Returns: { success, class_name, class_created, nets_added }.
Note: Non-existent net names are silently skipped.
`.trim();

export const DESCRIPTION_SET_PCB_LAYER_VISIBILITY = `
Purpose: Toggle PCB layer visibility.
Parameters:
- layer_names (string[], required): display names
- visible (boolean, required)
Returns: JSON confirming updated layers.
`.trim();

export const DESCRIPTION_LAYOUT_DUPLICATOR = `
Purpose: Find component groups with same footprint for layout copying.
Parameters: None.
Returns: JSON[] of groups with source/destination candidates.
`.trim();

export const DESCRIPTION_LAYOUT_DUPLICATOR_APPLY = `
Purpose: Copy layout geometry (tracks/arcs/fills/vias) from source to destination components.
Parameters:
- source_designators (string[], required)
- destination_designators (string[], required)
Returns: JSON with replication count per destination.
Note: Requires matching footprint.
`.trim();

export const DESCRIPTION_TAKE_VIEW_SCREENSHOT = `
Purpose: Capture PCB or schematic editor view as image.
Parameters: view_type ("pcb"|"sch", optional, default "pcb").
Returns: JSON with screenshot file path.
`.trim();

export const DESCRIPTION_GET_LIBRARY_SYMBOL_REFERENCE = `
Purpose: Get library symbol references for all components in .SchLib files. Three search modes:
1. If a .SchLib is already open in Altium -> enumerates all components in that library
2. If no .SchLib is open but a project is focused -> auto-opens all .SchLib files in the project and enumerates components
3. If neither -> returns error with guidance
Memory cache fallback: If the Altium bridge returns 0 components (e.g. SchLib failed to load, or no .SchLib in focused project), the tool automatically falls back to the memory cache built by import_library_components. Cached components do not include pin details.
Parameters:
- library_path (string?, optional): absolute path to a .SchLib file to query. If omitted, searches all .SchLib files in the focused project, then falls back to memory cache.
Returns: JSON { success, component_count, components[] { lib_reference, description, designator, part_count, library_name, pins[] { pin_number, pin_name, pin_type, pin_orientation, x, y, owner_part_id } } }
When source="memory_cache": components[] do not include pins[], but include library_path, project_name, footprint, and cached=true.
Note: Does NOT require a .SchLib to be pre-opened. Automatically searches the focused project. Falls back to memory cache if bridge returns 0.
`.trim();

export const DESCRIPTION_SEARCH_LIBRARY_SYMBOL = `
Purpose: Search schematic symbols by name across .SchLib files. Three search modes:
1. library_path PROVIDED -> searches that specific .SchLib file only
2. library_path OMITTED + focused project exists -> auto-iterates ALL .SchLib files in the focused project
3. library_path OMITTED + no focused project -> checks if a .SchLib is already open in Altium
If none of the above conditions are met, returns error with guidance. Does NOT show a file dialog.
Parameters:
- symbol_name (string, required): symbol name or partial name (case-insensitive)
- library_path (string?, optional): absolute path to a .SchLib file
Returns: JSON { found, match_count, libraries_searched, total_symbols, matches[] { name, description, library, exact_match } }
Note: Use import_library_components first to cache a library catalog into memory for faster repeat searches.
`.trim();

export const DESCRIPTION_IMPORT_LIBRARY_COMPONENTS = `
Purpose: Enumerate all components in a single project-directory .SchLib and cache the catalog into memory (short-term full + long-term summary) so place_component / search_library_symbol can reuse it later without re-querying Altium.
Parameters:
- library_path (string, required): absolute path to a .SchLib file (project directory only; do NOT point at AD default library dir).
Returns: JSON { success, library_name, library_path, component_count, project_name, memory_files.{short_term, long_term}, sample_components[] }.
Note: Compact per-component info captured: lib_reference, description, designator_template, part_count, footprint. After import, prefer reading the memory catalog (memory/short-term/{project}/library-catalog.md) before calling search_library_symbol or place_component.
`.trim();

export const DESCRIPTION_CREATE_SCHEMATIC_SYMBOL = `
[DISABLED — gated by ENABLE_SYMBOL_CREATION feature flag]
Purpose: Create new schematic symbol in SchLib.
Parameters:
- symbol_name (string, required)
- pins (string[], required): "number,name,type" format, type: I|O|B|P etc.
- part_count (int?, optional, default 1)
- description (string?, optional)
Returns: JSON with symbol name and library path.
`.trim();

export const DESCRIPTION_GET_OUTPUT_JOB_CONTAINERS = `
Purpose: List output job containers from .OutJob files.
Parameters: None.
Returns: JSON[] { name, outputType, enabled }.
`.trim();

export const DESCRIPTION_RUN_OUTPUT_JOBS = `
Purpose: Execute output job containers to generate manufacturing files.
Parameters: container_names (string[], required).
Returns: JSON with success, output file paths.
`.trim();

export const DESCRIPTION_PCB_EDIT = `
Purpose: Edit PCB via action-based single tool — create/delete/select/modify PCB primitives.
Parameters:
- action (required): add_track | add_pad | add_via | add_fill | add_arc | add_text | delete_objects | select_objects | add_region | add_polygon_pour | modify_track | modify_pad | modify_via | modify_text | modify_arc | modify_fill | modify_region | modify_polygon | move_to_layer | assign_net | rebuild_polygons
- Per action:
  - add_track: x1_mils, y1_mils, x2_mils, y2_mils, width_mils? (default 10), layer? (default top), net_name? (RECOMMENDED — assigns track net so it appears in the right netlist), is_keepout? (true/false, IPCB_Track.IsKeepout), moveable? (true/false, IPCB_Primitive.Moveable), primitive_lock? (true/false, IPCB_Primitive.PrimitiveLock)
  - add_pad: x_mils, y_mils (required); width_mils? (default 60), height_mils? (default=width), hole_size_mils? (default 0=SMD), layer? (default top), name? (pad designator, e.g. "P1"), net_name? (recommended! assigns pad net like GND/VCC instead of creating unrouted pad), rotation? (degrees, default 0), shape? (rounded|rectangular|octagonal|circle|roundrect|rotatedrect, default rounded), tenting_top?, tenting_bottom? (true/false, solder mask cover), testpoint_top?, testpoint_bottom? (true/false), paste_mask_expansion_mils?, solder_mask_expansion_mils? (numeric overrides, omit = follow rules), power_plane_connect_style? (relief|direct|none, default relief)
  - add_via: x_mils, y_mils, size_mils? (default 50), hole_size_mils? (default 20), net_name? (RECOMMENDED). Optional: low_layer?, high_layer? (start/end layer pair; default top→bottom; layer strings same as Layer values below), tenting_top?, tenting_bottom? (true/false, cover soldermask for via-in-pad), testpoint_top?, testpoint_bottom? (true/false)
  - add_fill: x1_mils, y1_mils, x2_mils, y2_mils, rotation? (default 0), layer? (default top), net_name? (IPCB_Fill.Net per API), is_keepout? (true/false), moveable? (true/false), primitive_lock? (true/false)
  - add_arc: x_center_mils, y_center_mils, radius_mils, start_angle? (default 0), end_angle? (default 360), width_mils? (default 10), layer? (default top), net_name? (IPCB_Arc.Net per API ref), is_keepout? (true/false), moveable? (true/false), primitive_lock? (true/false)
  - add_text: x_mils, y_mils, text, height_mils? (default 60), layer? (default top_overlay), rotation? (default 0). Optional font properties: stroke_width_mils? (stroke thickness for vector fonts), use_ttfont? (true/false, default true), font_name? (string, e.g. "Arial" or Default), bold?, italic? (true/false)
  - delete_objects: object_type (track|pad|via|fill|arc|text|component|all), layer? (optional)
  - select_objects: object_type, layer? (optional), select? (true|false, default true)
  - add_region: points_csv (x1,y1,x2,y2,...), layer? (default top), net_name? (optional), kind? (copper|cutout|named_region|board_cutout|cavity or 0-4; TRegionKind from API §3.8), is_keepout? (true/false), moveable? (true/false), primitive_lock? (true/false)
  - add_polygon_pour: points_csv, layer? (default top), net_name?, grid_mils? (default 10), track_size_mils? (default 8), min_track_mils? (default 4), hatch_style? (hatch90|hatch45|vhatch|hhatch|none|solid or 0-5; TPolyHatchStyle), pour_over? (none|same_net|same_net_polygons or 0-2; TPolygonPourOver), use_octagons? (true/false), remove_dead? (true/false), is_keepout? (true/false), moveable? (true/false), primitive_lock? (true/false)
  - modify_track: x1_mils?, y1_mils?, x2_mils?, y2_mils? (resize endpoints), width_mils?, layer?, net_name?, is_keepout?, moveable?, primitive_lock? (at least one change required), selected_only? (default true)
  - modify_pad: pad_name? (most precise! modifies exactly one pad by name, e.g. "P1" without selecting or deleting). Also optional: width_mils?, height_mils?, hole_size_mils?, layer?, rotation?, shape?, net_name? (RECOMMENDED — use this to assign/change pad net, NEVER delete+re-add just to set a net), tenting_top?, tenting_bottom?, testpoint_top?, testpoint_bottom?, paste_mask_expansion_mils?, solder_mask_expansion_mils?, power_plane_connect_style?, selected_only? (default true; ignored when pad_name is given)
  - modify_via: size_mils?, hole_size_mils?, net_name?, low_layer?, high_layer? (change via drill span), tenting_top?, tenting_bottom?, testpoint_top?, testpoint_bottom? (mark via as testpoint). At least one change required. selected_only? (default true)
  - modify_text: text?, x_mils?, y_mils? (move text), height_mils?, stroke_width_mils?, layer?, rotation?, use_ttfont?, font_name?, bold?, italic? (font controls). At least one required. selected_only? (default true)
  - modify_arc: x_center_mils?, y_center_mils?, radius_mils?, start_angle?, end_angle?, width_mils?, layer?, net_name? (IPCB_Arc.Net), is_keepout?, moveable?, primitive_lock? (at least one required). selected_only? (default true)
  - modify_fill: x1_mils?, y1_mils?, x2_mils?, y2_mils?, rotation?, layer?, net_name? (IPCB_Fill.Net), is_keepout?, moveable?, primitive_lock? (at least one required). selected_only? (default true)
  - modify_region: layer?, net_name?, kind? (TRegionKind copper|cutout|named_region|board_cutout|cavity|0-4), is_keepout?, moveable?, primitive_lock? (at least one required). selected_only? (default true)
  - modify_polygon: layer?, net_name?, grid_mils?, track_size_mils?, min_track_mils?, hatch_style? (TPolyHatchStyle 0-5 or strings), pour_over? (TPolygonPourOver 0-2 or strings), use_octagons? (true/false), remove_dead? (true/false), is_keepout?, moveable?, primitive_lock? (at least one required). selected_only? (default true). Run rebuild_polygons afterwards to apply visually.
  - selected_only (boolean?, optional, default true): for modify_* actions — true=modify only selected objects, false=modify all matching objects
  - move_to_layer: target_layer (required), object_type? (default all) — moves selected objects to target layer
  - assign_net: net_name (required), object_type? (default all) — assigns net to selected objects
  - rebuild_polygons: (no extra params) — rebuilds all polygon pours on the board
- Layer values: top|bottom|top_overlay|bottom_overlay|top_paste|bottom_paste|top_solder|bottom_solder|keepout|multi|mechanical1-16|internal_plane1-2|mid1-3 (low_layer/high_layer for blind/buried vias use the same strings)
Returns: Bridge JSON with action and parameters.
Note: Does not auto-save. Use zoom_view refresh after. Coordinates in mils relative to board origin. All modifications use BeginModify/EndModify for Undo support. All new properties verified against scripts-libraries-master/AD开发API参考/01_PCB对象与API.md + 05_枚举与常量参考.md + PCBObjectInspector.pas — NO fabricated properties.
`.trim();

export const DESCRIPTION_COMPILE_PROJECT = `
Purpose: Compile the focused project in Altium (runs ERC/DRC checks).
Parameters: None.
Returns: JSON { action, project, success }.
Note: Requires a focused project in the workspace.
`.trim();

export const DESCRIPTION_OPEN_DOCUMENT = `
Purpose: Open a document in Altium Designer.
Parameters:
- document_kind (string, required): SCH|PCB|PCBLIB|TEXT|PRJPCB
- file_path (string, required): absolute path to the document file
Returns: JSON { action, document_kind, file_path, success }.
`.trim();

export const DESCRIPTION_ZOOM_VIEW = `
Purpose: Zoom or refresh the current editor view.
Parameters:
- zoom_action (string, optional, default "redraw"): all|fit|redraw|refresh|in|out
Returns: JSON { action, zoom_action, success }.
`.trim();

export const DESCRIPTION_PCB_COMPONENT = `
Purpose: Manipulate PCB components via action-based single tool — rotate, flip, select, query/set properties.
Parameters:
- action (required): rotate | flip | select | get_properties | set_height | set_moveable | set_primitive_lock | set_name_visibility | set_comment_visibility | set_autoposition | get_3d_bodies | set_3d_body | set_lock_strings | set_component_kind
- designator (string, required): component reference designator (e.g. "U1", "R3")
- Per action:
  - rotate: rotation (number, required): absolute rotation angle in degrees (0-360)
  - flip: (no extra params) — flips component between top and bottom layer
  - select: select (boolean?, optional, default true): true=select, false=deselect
  - get_properties: (no extra params) — returns full component property sheet including: designator, identifier, source_designator, source_unique_id, source_description, source_lib_reference, source_footprint_library, source_component_library, pattern, footprint_description, default_pcb3d_model, layer, x_mils, y_mils, rotation, height_mils, width_mils, height_bbox_mils, selected, name_on, comment_on, moveable, lock_strings, primitive_lock, flipped_on_layer, is_bga, enable_pin_swapping, enable_part_swapping, group_num, channel_offset, unique_id, component_kind, name_autoposition, comment_autoposition, pin_count, pins[] (with full pad properties)
  - set_height: height_mils (number, required): new component height in mils
  - set_moveable: moveable (boolean, required): true=unlock, false=lock component (IPCB_Component.Moveable)
  - set_primitive_lock: primitive_lock (boolean, required): true=lock all child primitives owned by the component, false=unlock (IPCB_Component.PrimitiveLock — API §3.1 + PCBObjectInspector L883)
  - set_name_visibility: visible (boolean, required): true=show designator, false=hide
  - set_comment_visibility: visible (boolean, required): true=show comment, false=hide
  - set_autoposition: name_autoposition (number 0-9, optional), comment_autoposition (number 0-9, optional) — at least one required. Values: 0=CenterLeft, 1=CenterRight, 2=TopLeft, 3=BottomLeft, 4=TopRight, 5=BottomRight, 6=CenterAbove, 7=CenterBelow, 8=CenterCenter, 9=Manual
  - get_3d_bodies: (no extra params) — returns 3D model body info for component (body_count, bodies[] with index, layer, rotation, identifier, unique_id, moveable, name, standoff_height_mils, overall_height_mils, body_projection, override_color, body_color_3d, body_opacity_3d)
  - set_3d_body: body_index (integer, required, 0-based index from get_3d_bodies). Plus AT LEAST ONE of: standoff_height_mils? (number), overall_height_mils? (number), body_projection? (top/bottom or eBoardSide_Top/eBoardSide_Bottom), body_color_3d? (integer color), body_opacity_3d? (integer opacity). Writes exactly the IPCB_ComponentBody.StandoffHeight / OverallHeight / BodyProjection / BodyColor3D / BodyOpacity3D properties documented in API §3.9.
  - set_lock_strings: lock_strings (boolean, required): true=lock, false=unlock string primitives
  - set_component_kind: kind (string|int, required): standard|mechanical|graphical|net_tie_bom|net_tie_nobom|standard_nobom|jumper or 0-6. Writes IPCB_Component.ComponentKind (TComponentKind enum from 05_枚举 §8).
Returns: JSON confirming the operation result.
Note: rotate sets absolute angle, not relative. flip swaps layer (top<->bottom) and mirrors. All set_* operations use BeginModify/EndModify for Undo support. ALL set_* properties verified via 01_PCB对象与API.md §3.1 / §3.9 + PCBObjectInspector.pas L851/L883/L906-L911.
`.trim();

export const DESCRIPTION_PCB_DRC = `
Purpose: List all Design Rule Check (DRC) violations on the current PCB with detailed info.
Parameters: None.
Returns: JSON[] { index, description, detail, identifier, descriptor, object_id_string, unique_id, drc_error, selected, layer } for each violation.
Note: Run compile_project first to refresh violations. Empty array = no violations. identifier = rule name, descriptor = violation type.
`.trim();

export const DESCRIPTION_PCB_BOARD_INFO = `
Purpose: Get PCB board outline dimensions, area, outline points, and object counts.
Parameters: None.
Returns: JSON { left_mils, bottom_mils, right_mils, top_mils, width_mils, height_mils, area_sq_mils, outline_point_count, component_count, pad_count, via_count, track_count, arc_count, fill_count, text_count, polygon_count, region_count, connection_count, layer_count, outline_points[] }.
Note: Coordinates in mils. Object counts include all primitives on the board. layer_count = total layers in stackup.
`.trim();

export const DESCRIPTION_PCB_POLYGON_INFO = `
Purpose: List all polygon pour objects on the PCB with full properties and segment data.
Parameters: None.
Returns: JSON[] { index, layer, net, point_count, hatch_style, pour_over_type, polygon_type, grid_mils, track_size_mils, min_track_mils, pour_over, use_octagons, remove_dead, selected, unique_id, bbox_left_mils, bbox_bottom_mils, bbox_right_mils, bbox_top_mils, segments[] { index, x_mils, y_mils, kind } }.
Note: hatch_style: ePolyHatch90|ePolyHatch45|ePolyVHatch|ePolyHHatch|ePolyNoHatch|ePolySolid. pour_over_type: ePourOver_None|ePourOver_SameNet|ePourOver_All. polygon_type: ePolySignal|ePolyPlane|ePolySplit.
`.trim();

export const DESCRIPTION_PCB_NET_INFO = `
Purpose: Get detailed information about a PCB net or select all objects on a net.
Parameters:
- net_name (string, required): name of the net (e.g. "GND", "VCC", "D0")
- action (string?, optional, default "info"): "info" for net details, "select" to select/highlight all objects on the net
- select (boolean?, optional, default true): when action="select", true=select, false=deselect
Returns:
  - action="info": JSON { net_name, item_count, track_count, arc_count, pad_count, via_count, fill_count, polygon_count, region_count, total_copper_length_mils, connection_count, items[] { object_kind, layer, selected } }
  - action="select": JSON { action, net_name, selected, object_count, success }
Note: total_copper_length_mils = sum of track and arc lengths on the net. All counts are per-net.
`.trim();

export const DESCRIPTION_OVERLAP_REPORT = `
Purpose: Scan the entire PCB for component overlaps and out-of-board placements. Use BEFORE and AFTER moving components to validate placement quality.
Parameters: None.
Returns: JSON { total_conflicts, out_of_board_count, out_of_board[] }
Note: Checks all components using AABB bounding rectangle intersection with 20mil margin. Out-of-board uses 50mil edge margin. Call this after set_component_position to verify no overlaps were introduced.
`.trim();

export const DESCRIPTION_GENERATE_REPORT = `
Purpose: Generate a project report (netlist, BOM, etc.) from the focused project.
Parameters:
- report_type (string, optional, default "netlist"): netlist|bom|component_cross_reference|project_statuses|report_project
Returns: JSON { action, report_type, report_index, project, success }.
Note: report_type values:
  - netlist: Protel netlist format
  - bom: Bill of Materials
  - component_cross_reference: Component cross-reference report
  - project_statuses: Project status report
  - report_project: Project hierarchy report
`.trim();

