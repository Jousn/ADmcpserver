/**
 * MCP server `instructions` (sent on initialize). T10 token-slimmed: behavioral
 * discipline lives HERE; per-tool API details live ONLY in toolDefinitions.ts.
 * Keep aligned with src/toolDefinitions.ts (canonical tool descriptions).
 */
export const ALTIUM_MCP_INSTRUCTIONS = `
Altium MCP bridges to Altium Designer (AD 22+) via DelphiScript: Node writes request.json → launches X2.EXE → reads response.json. Every request carries a requestId echoed back by responses (stale responses are rejected by the poller).

## Setup
1. get_server_status → verify altiumExeFound, scriptProjectFound
2. If exe missing → configure_altium_exe; altium_ping → confirm bridge
3. get_workspace_projects → discover paths. Read-only PCB tools need the user to focus .PcbDoc; schematic tools take schematic_full_path (preferred) or project_full_path + schematic_sheet_file_name, no focus needed.

## Hard Rules (all tools)
- Units: mils everywhere. Schematic Y axis points UP, origin bottom-left; rotation counter-clockwise. Pin orientation is PER SYMBOL — never assume, read pin_table / get_component_info.
- Write gating: edit_schematic / pcb_edit / pcb_component / pcb_edit writes are ENABLED; create_schematic_symbol DISABLED.
- NEVER delete+re-add a primitive to change one property — use modify_* (pad_name= targets one pad exactly). New pads/tracks/vias MUST get net_name when known.
- VERIFY after EVERY write with an independent read (pcb_net_info action=info / pcb_component get_properties / check_connectivity). Never trust success:true alone. Never declare success without a machine verification gate.
- Tools never save — tell the user to Ctrl+S in Altium to persist.

## Error Quick Reference
| Error | Cause | Fix |
|-------|-------|-----|
| AD_NOT_FOUND | X2.EXE wrong path | configure_altium_exe |
| SCRIPT_PROJECT_NOT_FOUND | Script bundle not synced | get_server_status (auto-syncs) |
| TIMEOUT | Script hung / breakpoint / modal dialog in AD | Clear Altium IDE breakpoints; dismiss dialogs; delete .bridge.lock |
| LockTimeout | Previous crash left lock | Delete workspace/.bridge.lock |
| Empty data | PCB not focused | Focus .PcbDoc in Altium |
| INVALID_BRIDGE_RESPONSE | Response shape wrong | Check bridge_last_error.txt |
| STALE_RESPONSE | Response from an earlier request kept reappearing | Check for concurrent Altium script runs |
| PAD_NAME_NOT_FOUND | modify_pad pad_name not on board | List real pads via get_component_pins / pcb_component get_properties |
| SCHEMATIC_NOT_IN_OPEN_PROJECTS | Sheet not in an open project | open_document the .PrjPcb first; project DM layer must list the sheet |
| Unknown command | Older deployed Altium scripts | Re-sync scripts (get_server_status) or update the deployment |

## Tool Map (details in each tool's description — they are authoritative)
- Planning: pin_table → validate_netlist (stage 1); design_ledger (disk-side design state)
- Schematic write: edit_schematic (incl. draw_plan batch), wire_pins (PREFERRED wiring), optimize_layout (last)
- Schematic read/audit: get_schematic_data (use include_queries[] to filter buckets), check_connectivity (HARD GATE), analyze_schematic_quality, emc_audit, get_all_pin_hotspots (batch pin hotspots, one round trip)
- Library: pin_table, get_library_symbol_reference, search_library_symbol, import_library_components
- PCB read: get_pcb_layers/rules, get_all_nets, get_pcb_layer_stackup, get_all_designators, get_component_pins, get_selected_components
- PCB write: set_component_position, move_components, create_net_class, set_pcb_layer_visibility, layout_duplicator_apply, pcb_edit (21 actions: add/modify/delete/select primitives), pcb_component (14 actions)
- Output/KB/utility: get_output_job_containers, run_output_jobs, search_knowledge_base, get_knowledge_base_stats, get_server_status, configure_altium_exe, altium_ping, get_workspace_projects, take_view_screenshot, file_mode_capabilities, layout_duplicator

## Schematic Drawing Workflow (4 stages; the FROZEN netlist is the single source of truth)
STAGE 0 — knowledge + LAYOUT PLAN (mandatory before placement):
- search_knowledge_base (category schematic-design; circuit pattern in classic-circuits/power-supply); list_module_templates first — instantiate if a template matches.
- Produce a plan BEFORE touching the sheet: block map (signal flow left→right), rail map (power top / signal middle / GND bottom with exact pins per rail), per-part rotation WITH rationale + anchor pin, spacing budget (>=500 mil inter-part). Anchor-pin placement: place_component(anchor_pin="1", x_mils, y_mils, rotation_deg) puts that pin's hotspot exactly on (x,y) — always place by pin target, never by origin.
STAGE 1 — selection + netlist:
- design_ledger(action="load") at session start; design_ledger(action="save") after EVERY stage — constraints live on disk, not in conversation.
- pin_table for every symbol you intend to use; design connections against REAL pins, never memory.
- Build the netlist: every pin in a net OR in no_connect (strict_pin_coverage ON — a forgotten pin fails validation).
- validate_netlist until ok=true → freeze the returned netlist.
STAGE 2 — placement: place_component per BOM, coarse is fine (blocks left-to-right, >=100 mil apart); tools read back exact pin coordinates.
STAGE 3 — wiring + verification:
- wire_pins(net_name, pins=[FULL member list from the frozen netlist]) — routes, junctions, and verifies in one call. Power objects (place_gnd/place_vcc/place_power_port) snap to the nearest pin hotspot.
- check_connectivity (HARD GATE): compiled nets[] partition must equal the frozen netlist. Requires a real open project (Free Documents compile to nothing). Fix every error, re-run until ok=true + pins_floating=0; report pin-coverage explicitly (e.g. "pins connected: 24/24"). data_source="geometry-fallback" → compile_project first, verdicts unauthoritative otherwise.
- optimize_layout LAST (netlist-guaranteed re-route); re-place net labels/power ports afterwards.
- After emc_audit: translate findings into remediation, never invent numeric limits (thresholds configurable in-tool).

## Manual Wiring Rules (only for special cases — wire_pins otherwise)
R0: build a pin-coverage table FIRST — every pin of every component on exactly one net (or explicit no-connect); a placed-but-unrouted component = incomplete plan.
R1: endpoints target pin hotspots from get_component_info (free end, not component Location); snap_tolerance_mils (default 20) applies — the response's points_csv is what was drawn.
R2: orientation is per symbol; re-read get_component_info after ANY rotation (pin coordinates change).
R3: one net per wire_pins call with the COMPLETE pin list (partial lists produce sprawling stubs).
R4: power ports/labels sit exactly on pin hotspots or wires.
R5: a wire terminates at the pin it ENDS on — a span touching a second pin of the same part shorts it (SHORT_ACROSS_COMPONENT).
R6: junctions at every 3+ wire T-contact (wire_pins adds them automatically).

## Memory Protocol (compact)
- After first query of PCB/schematic data, record compact memory (components/pin-nets) to cut repeat queries; update after writes instead of re-querying.
- import_library_components caches the project .SchLib catalog to memory/short-term/{project}/library-catalog.md — read it BEFORE placing or searching symbols; project-directory .SchLib only.
- design_ledger carries the authoritative netlist/placement/progress between stages and sessions.

## Knowledge Base
search_knowledge_base BEFORE design decisions (topology, values, placement rules) and before any write stage; categories: classic-circuits, design-rules, component-selection, drc-templates, power-supply, schematic-design, signal-integrity, emc (when present).

Bridge JSON: { success, result?, error? }. Failed runs write bridge_last_error.txt (paste Altium Messages text into bridge_user_reported_error.txt, then re-run get_server_status for diagnostics).
`.trim();
