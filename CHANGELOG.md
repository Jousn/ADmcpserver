# Changelog

## 0.2.0 (2026-10-25)

- `emc_audit` tool: deterministic schematic-side EMC rule engine (L1 of the EMC×AI plan) — 12 rules over the compiled netlist + component parameters (input filter completeness CM-choke/X-cap/Y-cap with value thresholds, IC rail decoupling, multi-ground bridging, magnetics snubbers, MOSFET gate series R, crystal load caps, connector ESD). Reports findings with evidence + checks_passed audit trail; thresholds and net-name recognition (NET_PATTERNS) configurable. 37 unit tests.
- `fetchSchematicAuditData` now carries `componentParameters` (designator → parameter map) from the Pascal `get_schematic_data` components bucket.

## 0.1.0

- Initial TypeScript MCP server (stdio) for Trae.
- Windows bridge: `request.json` / `response.json`, workspace lock, Altium `X2.EXE` launch line.
- Bundled DelphiScript project (MIT-derived from coffeenmusic/altium-mcp) plus `ping` command.
- Tools: status, configure executable, ping, PCB layers/rules/nets/stackup, designators, component pins, file-mode capability report.
- JSON Schema for bridge request/response under `schemas/`.
- Vitest unit tests for helpers.
