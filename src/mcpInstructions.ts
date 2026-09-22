/**
 * MCP server `instructions` (sent on initialize). Keep aligned with:
 * - `src/toolDefinitions.ts` (canonical descriptions on each tool)
 */
export const ALTIUM_MCP_INSTRUCTIONS = `
Altium MCP bridges to Altium Designer (AD 22+) via DelphiScript. Node writes request.json → launches X2.EXE → reads response.json.

## Architecture — Advisory + Write Mode
MCP provides AI advisory capabilities (reads, reviews, suggestions) and gated write operations.
Write operations are gated by Feature Flags; current state (must match src/index.ts and Altium_API.pas):
- ENABLE_SCHEMATIC_WRITES = true (edit_schematic ENABLED)
- ENABLE_PCB_WRITES = true (set_component_position, move_components, create_net_class, set_pcb_layer_visibility, layout_duplicator_apply, pcb_edit, pcb_component ENABLED)
- ENABLE_SYMBOL_CREATION = false (create_schematic_symbol DISABLED — not yet audited)
To toggle, set the flag in src/index.ts and Altium_API.pas, then rebuild.

## Setup
1. get_server_status → verify altiumExeFound, scriptProjectFound
2. If exe missing → configure_altium_exe
3. altium_ping → confirm bridge
4. get_workspace_projects → discover project/document paths

## Document Focus Rules
- PCB read tools (get_pcb_*, get_all_designators, get_component_pins, get_selected_components): user must focus .PcbDoc first
- Schematic read (get_schematic_data): no PCB focus needed, pass schematic_full_path or project+sheet name
- Library/output tools: AD running, no specific focus needed

## Coordinate Units
- Schematic: mils (x_mils, y_mils)
- PCB read (get_component_pins, get_selected_components): mils
- PCB write (set_component_position): mils (x, y — absolute position)
- PCB write (move_components): mils (x_offset, y_offset — relative offset)
- PCB write (pcb_edit add_track/add_pad/add_via/etc.): mils

## Key Behaviors
- get_schematic_data: use include_queries[] to filter buckets (avoid context overflow)
- All operations serialized via .bridge.lock (~60s wait, 120s timeout)

## Error Quick Reference
| Error | Cause | Fix |
|-------|-------|-----|
| AD_NOT_FOUND | X2.EXE wrong path | configure_altium_exe |
| SCRIPT_PROJECT_NOT_FOUND | Script bundle not synced | get_server_status (auto-syncs) |
| TIMEOUT | Script hung/breakpoint set | Clear Altium IDE breakpoints; delete .bridge.lock |
| LockTimeout | Previous crash left lock | Delete workspace/.bridge.lock |
| Empty data | PCB not focused | Focus .PcbDoc in Altium |
| INVALID_BRIDGE_RESPONSE | JSON parse failed | Check bridge_last_error.txt |
| PAD_NAME_NOT_FOUND | modify_pad pad_name not on board | Use get_components or pcb_component get_properties first to list real pad names |
| PAD_NET_MISSING | create/modify pad without net_name → pad stays unrouted | Always pass net_name; if net doesn't exist yet, add a GND/VCC via add_net class in schematic first or accept AD auto-net on next re-annotation |

## Tool Quick Map
Read-only (PCB focus needed): get_pcb_layers, get_pcb_rules, get_all_nets, get_pcb_layer_stackup, get_all_designators, get_component_pins, get_selected_components
PCB write (ENABLED): set_component_position, move_components, create_net_class, set_pcb_layer_visibility, layout_duplicator_apply, pcb_edit, pcb_component
Schematic write (ENABLED): edit_schematic (incl. draw_plan batch), wire_pins (PREFERRED wiring path), optimize_layout (final polish)
Planning (stage 1): pin_table (library pin definitions pre-placement), validate_netlist (golden-netlist machine validation)
Library: get_library_symbol_reference, search_library_symbol, import_library_components
~~Symbol creation (DISABLED)~~: create_schematic_symbol
Output: get_output_job_containers, run_output_jobs
Utility: get_server_status, configure_altium_exe, altium_ping, get_workspace_projects, take_view_screenshot, file_mode_capabilities
Layout discovery: layout_duplicator
Knowledge base: search_knowledge_base, get_knowledge_base_stats

## Pad Operations — Mandatory Workflow (critical!)
When a user wants to set/change a pad's net, shape, testpoint, rotation, mask expansion, or tenting:

1. NEVER 'select all pads -> delete -> add_pad' just to change one property. This destroys valid pads and introduces DRC breaks.
2. For a single pad: call 'pcb_edit action=modify_pad pad_name=... net_name=GND' (plus any property). 'pad_name' targets exactly one pad by its designator — no select, no delete.
3. For multiple selected pads: first 'select_objects object_type=pad select=true' then 'modify_pad net_name=GND selected_only=true'.
4. For a brand-new pad: 'pcb_edit action=add_pad' MUST include 'net_name' (e.g. GND/VCC) when known. An add_pad without net_name creates a floating pad that requires later manual cleanup.
5. Available pad properties in add_pad / modify_pad:
   - net_name — assign electrical net (GND, VCC, SPI_MOSI, etc.) — **most often missing property**
   - rotation — pad rotation in degrees (0/90/180/270)
   - shape — rounded | rectangular | octagonal | circle | roundrect | rotatedrect
   - tenting_top / tenting_bottom — boolean, solder mask cover for via-in-pad / SMD cover
   - testpoint_top / testpoint_bottom — boolean, mark as assembly testpoint
   - paste_mask_expansion_mils / solder_mask_expansion_mils — numeric override in mils (omit = follow rule defaults)
   - power_plane_connect_style — relief | direct | none
6. VERIFY after any write: call 'pcb_component action=get_properties designator=...' or 'get_all_nets' and confirm the pad's net matches what you wrote. Never trust only a 'success:true' reply.

## Other PCB Primitive Operations — Mandatory Workflow
All properties below are sourced directly from 01_PCB对象与API.md §3 (IPCB_Track/Via/Arc/Text/Fill/Region/Polygon) and are NOT invented. Prefer modify_* over delete+add to preserve undo history, net membership, and existing DRC state.

A. Via (IPCB_Via §3.5)
- add_via / modify_via now expose: low_layer + high_layer (blind/buried via drill span), tenting_top/bottom, testpoint_top/bottom, AND net_name.
- Rule: if you need a GND stitching via on the top side that does NOT penetrate the whole stack, use low_layer=top high_layer=mid2 (example) on add_via — NEVER hand-edit the file structure.
- Verify after write: call get_all_nets or pcb_net_info action=info and confirm the new via appears in the target net.

B. Track (IPCB_Track §3.2)
- add_track and modify_track now support net_name (most critical missing property before — tracks were floating until modify_track post-assigned a net).
- modify_track now accepts x1_mils/y1_mils/x2_mils/y2_mils to change endpoints without deleting the track; use this instead of delete+re-add to trim/extend a selected track.
- Rule: always add net_name on add_track when known, otherwise the new segment does not inherit net from connected pads automatically until the user runs a connection update.
- Verify: pcb_net_info action=info net_name=... should show length equal to track segments added.

C. Arc (IPCB_Arc §3.3)
- add_arc and NEW modify_arc now support net_name (Arc.Net from API). Previously arcs could not be assigned to any net.
- modify_arc supports all 8 properties: x_center, y_center, radius, start_angle, end_angle, width_mils, layer, net_name — all optional; selected_only=true default.

D. Fill (IPCB_Fill)
- add_fill now supports net_name (verified: PCBObjectInspector L980+ Fill.Net exists) AND the three IPCB_Primitive inherited flags: is_keepout / moveable / primitive_lock.
- modify_fill now supports: x1/y1/x2/y2 (corners), rotation, layer, NET_NAME (Fill.Net), plus is_keepout / moveable / primitive_lock — all optional (at least one required). selected_only=true default.
- Note: Earlier we incorrectly stated 'no net property on IFill in API ref'. The correct IPCB_Fill.Net property IS present in both 01_PCB API and PCBObjectInspector reference scripts; Fill.Net is now exposed everywhere.

E. Text (IPCB_Text §3.6)
- add_text and modify_text now expose these additional IPCB_Text properties that existed in the API but were previously hard-coded:
  - x_mils / y_mils on modify_text (move a selected text object in place)
  - stroke_width_mils (= Text.Width, stroke thickness)
  - use_ttfont (= UseTTFonts; true/false)
  - font_name (= FontName; e.g. "Arial" or "Default")
  - bold / italic (= Bold / Italic)
- modify_text behavior: all properties optional; at least one must be provided. selected_only=true default.
- Note: IsDesignator/UnderlyingString are read-only on component-owned designators; we intentionally do NOT expose writes to component-owned text here (change component properties through set_component_position + CommentOn/NameOn via pcb_component instead).

F. Component (IPCB_Component §3.1) — NEW WRITE ACTIONS added this batch
  [All properties verified directly against 01_PCB对象与API §3.1 / §3.9 + PCBObjectInspector.pas L851 (ComponentKind) / L883 (PrimitiveLock) / L906-L911 (3D Body).]
- F1. action=set_primitive_lock (new): primitive_lock=true/false → writes IPCB_Component.PrimitiveLock. This locks/unlocks ALL child primitives (pads/tracks/etc.) owned by the component in one call — distinct from set_moveable (component-level position lock) or set_lock_strings (only Name/Comment text locks).
- F2. action=set_component_kind (new): kind=standard|mechanical|graphical|net_tie_bom|net_tie_nobom|standard_nobom|jumper (or integer 0-6 enum ordinal from 05_枚举 §8 TComponentKind). Writes IPCB_Component.ComponentKind — required when converting a footprint into a net-tie or mechanical component type.
- F3. action=set_3d_body (new): write properties of a SPECIFIC 3D body attached to the component. Required parameter body_index=0 (from get_3d_bodies listing, 0-based). Optional properties, at least one required:
    - standoff_height_mils → IPCB_ComponentBody.StandoffHeight
    - overall_height_mils  → IPCB_ComponentBody.OverallHeight
    - body_projection      → IPCB_ComponentBody.BodyProjection (top/bottom/eBoardSide_Top/eBoardSide_Bottom / TBoardSide)
    - body_color_3d        → IPCB_ComponentBody.BodyColor3D (integer ARGB — same format as get_3d_bodies reads)
    - body_opacity_3d      → IPCB_ComponentBody.BodyOpacity3D (integer)
  Rule: ALWAYS call get_3d_bodies first to discover body_index, unique_id, and current values. We never expose writes to Texture / ModelHasChanged / etc. — only the 5 scalar properties both readable AND writable per Inspector L906-L911.
- Legacy reads still unchanged: get_properties already returns name_on, comment_on, height_mils, primitive_lock, lock_strings, moveable, selected, layer, component_kind, unique_id, source_designator, source_lib_reference, source_footprint_library.

G. Polygon / Region (IPCB_Polygon §3.7 / IPCB_Region §3.8)
- G1. add_region extended (NEW in add path): kind=copper|cutout|named_region|board_cutout|cavity or 0-4 TRegionKind enum — verified against 01_PCB §3.8 Kind:TRegionKind + 05_枚举 §5. Also adds the 3 inherited primitive flags is_keepout/moveable/primitive_lock.
- G2. add_polygon_pour extended beyond the previous 0-5/solid shortcut: hatch_style now accepts the full TPolyHatchStyle set (hatch90/hatch45/vhatch/hhatch/none/solid or 0-5). pour_over replaces the old true/false boolean with the full TPolygonPourOver enum: none=0 / same_net=1 / same_net_polygons=2 or string aliases. Also adds use_octagons / remove_dead booleans + is_keepout / moveable / primitive_lock.
- G3. modify_region (NEW action): layer, net_name, kind (TRegionKind), is_keepout/moveable/primitive_lock — scalar-only properties; at least one required. selected_only default true.
- G4. modify_polygon (NEW action): layer, net_name, grid_mils/track_size_mils/min_track_mils, hatch_style, pour_over, use_octagons, remove_dead, plus is_keepout/moveable/primitive_lock — scalar-only; at least one required. selected_only default true.
  Rule after modify_polygon: run rebuild_polygons action to refresh the pour visualization (same rule users already know for net changes). We intentionally do NOT expose outline-point edits here (PointCount / MainContour rebuild / contour locking) — scripts-libraries-master only provides Kind/PolyHatchStyle/PourOver scalar writes; no fabricated point-edits.
- G5. assign_net still works on any selected primitive (including region/polygon) — unchanged; modify_* now provides the direct net setter.

H. Delete/Select object_type filter
- object_type already accepts: track | pad | via | fill | arc | text | component | all, plus optional layer filter. Polygon/region objects fall under 'all' for now; this matches PcbEditParseObjectSet current MkSet entries; no fake IDs added.

## Primitive flags matrix (IsKeepout / Moveable / PrimitiveLock) — API verified
These three flags are inherited from IPCB_Primitive and are NOW consistently exposed on the creation AND modification path for every primitive type that supports them in scripts-libraries-master:

| Primitive type  | add_* exposes? | modify_* exposes? | Verified source                          |
|-----------------+----------------+-------------------+------------------------------------------|
| Track           | YES            | YES               | 01_PCB §3.2 IsKeepout + Inspector L890+  |
| Arc             | YES            | YES               | 01_PCB §3.3 + Inspector L1279+           |
| Fill            | YES            | YES               | Inspector L987+ Fill.Net/IsKeepout/etc.  |
| Pad             | via pad APIs   | via pad APIs      | pad path keeps its own Mask/Testpoint flags (separate — no merge to keep pad semantics intact) |
| Via             | via APIs       | via APIs          | via path keeps Tenting/Testpoint flags (separate) |
| Region          | YES            | YES               | Inspector L1183+ + 01_PCB §3.8           |
| PolygonPour     | YES            | YES               | Inspector L1126+                         |
| Text            | Not in API     | Not in API        | Text lacks these per Inspector — INTENTIONALLY NOT fabricated |

## Post-Write Validation Rules (AGENTS.md)
Apply these to every write tool, not just pads:
1. After add_track / add_via / add_arc / add_fill with a net_name, run pcb_net_info action=info net_name=<net> and confirm the primitive shows up.
2. After modify_* with net_name or via layer changes, run the same pcb_net_info call OR pcb_component get_properties designator=<owner>.
3. After set_component_kind / set_primitive_lock / set_3d_body: run pcb_component get_properties or get_3d_bodies respectively and read back the exact field you wrote (component_kind / primitive_lock / standoff_height_mils etc.) — NEVER trust success:true alone.
4. After modify_polygon: run rebuild_polygons first, then pcb_polygon_info and confirm the target polygon's hatch_style / pour_over / net matches the values you wrote.
5. Never declare success based only on bridge JSON success:true.

## Knowledge Base Vector Search (search_knowledge_base)
The knowledge base contains 60+ files (714 chunks) covering circuit templates, design rules, component selection, and DRC templates. It uses TF-IDF vector similarity for semantic search.
Categories: classic-circuits, design-rules, component-selection, drc-templates, power-supply

### When to Call search_knowledge_base
- BEFORE making design decisions (topology, component values, layout rules)
- When user asks about circuit design rules, formulas, or best practices
- When user mentions specific component types (LDO, Buck, MCU, opamp, USB, etc.)
- When deriving DRC rules, impedance targets, or decoupling strategies
- BEFORE placing components or routing (to get placement rules)

### Workflow Integration
1. Detect design stage from user intent (Requirement -> Schematic -> Layout -> Routing -> Verify)
2. Call search_knowledge_base with relevant query BEFORE using MCP write tools
3. Use returned knowledge to inform design decisions
4. After operations, call memory tools to cache results

Example: User says "design LDO power supply"
1. search_knowledge_base("LDO design capacitor selection", "classic-circuits") -> get LDO circuit templates
2. search_knowledge_base("decoupling capacitor placement", "design-rules") -> get placement rules
3. search_library_symbol("AMS1117") -> confirm library part exists
4. edit_schematic(place_component) -> place parts using knowledge from step 1-2

## Library Catalog Memory (import_library_components)
- import_library_components(library_path): enumerate one project-directory .SchLib and cache compact component info (lib_reference, description, footprint, part_count) into memory/short-term/{project}/library-catalog.md + summary in memory/long-term/{project}.md
- After import, read the cached catalog (memory/short-term/{project}/library-catalog.md) to resolve lib_reference + sch_library_path without re-querying Altium
- Only project-directory .SchLib files are supported; do NOT point library_path at the AD default library directory

## Schematic Drawing Workflow (preferred path)
Four design stages, each with machine verification. The NETLIST from stage 1 is the single source of truth — every later stage (wiring, verification, optimization) compares against it, never re-derives it.

STAGE 0 — knowledge retrieval + LAYOUT PLAN (mandatory, BEFORE any placement):
0.1 search_knowledge_base — ALWAYS retrieve layout knowledge before drawing:
    - category="schematic-design" for layout/routing/naming rules (01-pre-draw-layout-planning is the entry point)
    - the circuit type (e.g. "buck input stage layout") in classic-circuits / power-supply for module-specific patterns
    - list_module_templates first — if a matching module template exists, its layout conventions are already verified; skip to instantiation.
0.2 Produce a LAYOUT PLAN (in your reply, before touching the sheet) with four artifacts:
    - Block map: functional blocks left-to-right (signal flow), power entry left, outputs right
    - Rail map: horizontal rails per block (power rail top, signal row middle, GND bottom) with the EXACT pins that land on each rail at the same y
    - Placement sketch: per component — rotation WITH a facing rationale ("pins face right into the circuit", "divider chain pin1-top") and the anchor pin that lands on a rail
    - Spacing budget: inter-part gaps >=500 mil; label slots >= 40+60*chars+30 mil (VIN_RAW => ~570); divider mid-gap >=300 mil
0.3 Self-check the plan (orientation rationale for every part, rails straight, no wire-through-body paths, feedback as net labels). Only then proceed to STAGE 1. NEVER start placing components without a plan — "optimize later" costs 10x more than planning now.
Anchor-pin placement makes rails straight BY CONSTRUCTION: place_component(anchor_pin="1", x_mils, y_mils, rotation_deg) puts that pin's hotspot exactly on (x,y) — AD rotates around off-center origins, so always place by pin target, never by component origin.

STAGE 1 — selection + netlist (before touching the sheet):
0.4 DESIGN LEDGER (mandatory discipline): design constraints live on DISK, not in conversation memory. design_ledger(action="load", schematic_full_path=...) at the START of any stage or session resumption; design_ledger(action="save", state={...}) after EVERY stage (plan / frozen netlist / placement / wiring / verification). The save response carries a review digest — treat its warnings (pending placements, pending nets, stale progress, missing rationales) as gates before the next stage. After load, use the LEDGER's netlist/placement/rails, never recalled coordinates.
1. search_knowledge_base for topology/selection knowledge (classic-circuits / component-selection / design-rules).
2. pin_table(["Res1","Cap","LED0",...]) — REAL pin numbers/names/electrical-types/orientations for every symbol you intend to use. Design connections against this table, NEVER from memory: hallucinated pins (U1.14 on a 12-pin part) are the #1 netlist failure. eElectricPower pins belong on VCC/GND-style nets. Symbol orientation is per-symbol — check orientation_deg before planning rotations.
3. Build the netlist: components [{designator, lib_reference}] + nets [{name, pins=["R1.2",...]}] with EVERY pin accounted for — every pin must belong to a net OR be listed in no_connect (strict_pin_coverage is ON by default: a forgotten net fails validation with PIN_UNASSIGNED instead of silently floating).
4. validate_netlist — machine check (hallucinated pins, one-pin-two-nets shorts, strict pin coverage, power pins). Iterate until ok=true. The returned frozen_netlist is your golden baseline.

STAGE 2 — placement (coarse is fine; geometry is the TOOL's job later):
5. Resolve the sheet: pass schematic_full_path (preferred) or project_full_path + schematic_sheet_file_name.
6. place_component per BOM entry — position coarsely by functional blocks (left-to-right signal flow, power top/bottom, >=100 mil apart); exact pin coordinates are read back by the tools, not computed by you.

STAGE 3 — wiring + polish:
7. Wire each net with wire_pins(net_name, pins=[...]) using the FROZEN netlist members: it reads actual pin hotspots, routes orthogonal obstacle-avoiding wires, places junction dots, draws in one call, and verifies all listed pins landed on one net.
8. Power objects: place_gnd / place_vcc / place_power_port snap to the nearest pin hotspot automatically (default 25 mil tolerance). Net labels after optimize_layout (it rewires the sheet — re-place labels/ports afterwards).
9. check_connectivity (HARD GATE): the compiled nets[] partition must match the frozen netlist's pin membership. Requires a real open project (Free Documents compile to nothing — open the .PrjPcb via open_document first).
10. optimize_layout (optional, LAST): hill-climbs moves/rotations, re-routes the whole sheet, guarantees the netlist partition is unchanged. Re-place net labels/power ports afterwards if any floated.

Manual wiring (edit_schematic add_wire) still works and now snaps its endpoints: the polyline's first/last points snap to the nearest pin hotspot / power port within snap_tolerance_mils (default 20; 0 disables), other points grid-round to 10 mils, and the response returns the ACTUAL points_csv + every snap applied. Use manual add_wire only for special cases (bus entries, short stubs); use wire_pins for everything net-shaped.
Coordinate conventions: mils; Altium schematic Y axis points UP, origin bottom-left; rotation is counter-clockwise. Symbol default pin orientation is PER SYMBOL (Res1 horizontal, Cap/LED vertical, ...) — do NOT assume; check pins[] orientation from pin_table (pre-placement) or get_component_info (after placing/rotating).

## Wiring Rules
wire_pins handles coordinates, obstacle avoidance, junction dots and verification automatically — the only rule you MUST follow is R0 (plan the netlist completely before wiring). The rest applies when drawing wires manually (edit_schematic add_wire):
- R0. PIN-COVERAGE TABLE (do this FIRST): before wiring, build a table of EVERY placed component and EVERY pin. Each pin must be assigned to exactly one net (power pins get VCC/GND, unused pins get a no-ERC marker or an explicit note). If any component has ZERO nets assigned — e.g. a bias resistor you placed but forgot to route — the plan is INCOMPLETE: do not start wiring until every pin of every component is accounted for. Typical miss: components placed early and then dropped from the netlist plan.
- R1. PIN COORDINATES ONLY: manual wire endpoints should target pin x_mils/y_mils from get_component_info (the pins' FREE-END electrical hotspots, not the component Location). Endpoints within snap_tolerance_mils (default 20) snap to the nearest hotspot server-side — the response's points_csv is what was actually drawn. NEVER use the component Location/center or a point along the pin's own wire.
- R2. ORIENTATION IS PER SYMBOL: 2-pin symbols differ (Res1 horizontal, Cap/LED vertical...). Do not assume — check pins[] orientation via get_library_symbol_reference before planning rotations, and re-read get_component_info after ANY rotation (pin coordinates change).
- R3. ONE NET PER wire_pins CALL: pass the COMPLETE pin list of the net (the router builds its own MST; partial lists produce sprawling stubs).
- R4. POWER OBJECTS: place_gnd / place_vcc / place_power_port snap onto the nearest pin hotspot (default 25 mil) — pass the pin coordinate, not a nearby point. Net labels likewise must sit exactly on a wire or pin location (no snapping there yet: be precise).
- R5. TERMINATE AT ONE PIN (manual wiring, 2-pin parts): a wire connects to the pin it ENDS on. Never draw a wire whose span passes through a component and touches a SECOND pin of the same part — that shorts it. check_connectivity reports this as SHORT_ACROSS_COMPONENT.
- R6. JUNCTIONS: wire_pins adds them automatically. Manually: add_junction at every 3+ wire T-contact; check_connectivity flags missing ones.

## Connectivity Verification (HARD GATE — no exceptions)
A drawing report WITHOUT verification is UNVERIFIED and must be reported as such — NEVER claim "100% success" or "complete" based on tool call success rates alone. Tool calls succeeding only means objects were created, NOT that they connect. The final report must include the pin-coverage result explicitly (e.g. "pins connected: 24/24" or a list of unconnected pins).
MACHINE VERIFICATION — call check_connectivity (same sheet parameters as get_schematic_data) after wiring. It compiles the project and audits: SHORT_ACROSS_COMPONENT (a wire shorting a part by touching two of its pins — the R5 bug), POWER_NET_SHORT (VCC merged with GND), FLOAT_PIN (pin on no net), plus warnings (T-contacts without junctions, dangling wire ends, labels not on wires). Its nets[] lists every net with its pin members — diff it against your R0 pin-coverage table.
- ok=true + pins_floating=0 -> wiring is verified; report done (saving is the USER's action in Altium, not a tool call).
- Any error -> fix per its message (delete_object the bad wire, recompute from get_component_info pin coordinates, re-add, re-run check_connectivity). data_source="geometry-fallback" means the compile layer failed — run compile_project and retry for authoritative verdicts.
1. get_component_info for EVERY component -> collect all pin coordinates (also feeds the R0 table).
2. check_connectivity -> machine audit (errors + warnings + nets[]).
3. Resolve every reported error and re-run until ok=true; resolve warnings too (they indicate fragile wiring).
4. Optionally compile_project for ERC-level checks. Do NOT save via tools — tell the user to save in Altium (Ctrl+S) if they want changes persisted.

## Drawing-Quality Prediction (before committing to a layout)
BEFORE placing/wiring (or before rotating components) run analyze_schematic_quality — it is read-only and predicts how the drawing will LOOK: crossings between different-net wires, total bends, wire length, wire-through-body hits, per-net detour ratios (actual/MST). It also SIMULATES hypothetical transforms (transforms: [{designator, x_mils?, y_mils?, rotation_deg?}]) and auto-tries all 4 rotations per component, reporting which rotations improve the estimated score — the classic fix is a 2-pin polarized part (electrolytic cap) whose pins face away from its rails; 180° rotation makes both connections direct L shapes. Workflow: analyze_schematic_quality -> pick suggestion -> set_component_transform -> get_component_info (NEW pin coords!) -> rewire -> check_connectivity (electrical gate). Electrical correctness is NEVER judged by the quality tool — the netlist is treated as invariant.

## get_library_symbol_reference — Usage Guide
Three search modes (no parameters needed):
1. If a .SchLib is already open in Altium -> enumerates all components in that library
2. If no .SchLib is open but a project is focused -> auto-opens all .SchLib files in the project
3. If neither -> returns error with guidance
Does NOT require a .SchLib to be pre-opened. Automatically searches the focused project.

## search_library_symbol — Usage Guide
Three search modes based on library_path parameter:
1. library_path PROVIDED -> searches that specific .SchLib file only
2. library_path OMITTED + focused project exists -> auto-iterates ALL .SchLib files in the focused project
3. library_path OMITTED + no focused project -> checks if a .SchLib is already open in Altium
If none of the above conditions are met, returns error with guidance. Does NOT show a file dialog.
Recommended workflow: use import_library_components first to cache catalog, then search_library_symbol will check memory cache before falling back to Altium bridge.

Bridge JSON: { success, result?, error? }. Failed runs write bridge_last_error.txt.
`.trim();
