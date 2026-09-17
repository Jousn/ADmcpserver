# altium-mcp

**Model Context Protocol (MCP) server** that connects MCP clients (like OpenCode, etc.) to **Altium Designer** on **Windows**, so an assistant can query **PCB and schematic** data and drive DelphiScript automation.

This is a **third-party** project; it is not affiliated with Altium.

## Requirements

| Item | Notes |
|------|--------|
| OS | **Windows 10/11** (live bridge targets Altium on Windows) |
| Altium Designer | **22+** recommended (`X2.EXE`) |
| Node.js | **20+** |
| MCP Client | Any MCP-compatible client (e.g., OpenCode) via stdio |

## Quick start

```bash
npm install
npm run build
```

Configure your MCP client to connect to this server via `node dist/index.js` (or `altium-mcp` if installed globally).

**OpenCode Setup:** See [docs/opencode-deployment-guide.md](docs/opencode-deployment-guide.md) for detailed deployment instructions.

First steps in the IDE:

1. Call MCP tool **`get_server_status`** — confirms workspace paths and `X2.EXE` discovery (and syncs scripts into the workspace `AltiumScript/` folder).
2. If needed, call **`configure_altium_exe`** with the full path to `X2.EXE`.
3. Call **`altium_ping`** to confirm the DelphiScript bridge responds inside Altium.
4. Use **`get_workspace_projects`** to discover open `.PrjPcb` paths and schematic sheet paths.
5. **PCB:** with the target `.PcbDoc` **open and focused** in Altium, use `get_pcb_layers`, `get_all_nets`, etc.
6. **Schematic:** `get_schematic_data` and **`edit_schematic`** do not require an active PCB; pass `schematic_full_path` or `project_full_path` + `schematic_sheet_file_name`. After edits, call `get_schematic_data` again on the same sheet to verify.

Agent-oriented details (timeouts, lock file, placement hints) are in the MCP server `instructions` and in [docs/](docs/). Schematic edit coverage and notes: [docs/edit-schematic-progress.md](docs/edit-schematic-progress.md).

## How it works

- The server writes **`request.json`** under the workspace (default `%USERPROFILE%\.altium-mcp\workspace`).
- It launches Altium with **`-RScriptingSystem:RunScript`** pointing at the bundled **`Altium_API.PrjScr`** project.
- DelphiScript **`Run`** reads the request, runs PCB/SCH API calls, and writes **`response.json`**.
- A file lock **`.bridge.lock`** serializes concurrent tool calls (longer timeout for `edit_schematic`).

See [docs/architecture.md](docs/architecture.md) and JSON schemas in [schemas/](schemas/).

## MCP tools (high level)

| Tool | Purpose |
|------|---------|
| `get_server_status` | Paths, env, whether `X2.EXE` and script project exist; bridge diagnostic snippets |
| `configure_altium_exe` | Save `X2.EXE` path to `%USERPROFILE%\.altium-mcp\config.json` |
| `altium_ping` | Health check via DelphiScript |
| `get_workspace_projects` | Open workspace projects and logical documents (paths for SCH/PCB tools) |
| `get_schematic_data` | Export schematic sheet data; optional `include_queries[]` to filter buckets (wires, nets, components, …) |
| `edit_schematic` | Edit a `.SchDoc` (move/rotate, parameters, place component, wires, buses, net labels, power ports, …) |
| `get_pcb_layers` / `get_pcb_rules` / `get_all_nets` / `get_pcb_layer_stackup` | Active **focused** PCB queries |
| `get_all_designators` | All component designators on the PCB |
| `get_component_pins` | Pins for given designators |
| `file_mode_capabilities` | Whether offline `.PcbLib`/`.SchLib` tools are wired (extension point) |

## DelphiScript source

The `altium-scripts/` tree is **MIT-licensed** code derived from [coffeenmusic/altium-mcp](https://github.com/coffeenmusic/altium-mcp), with additions such as **`ping`**, **`get_schematic_data` / schematic export**, and **`schematic_edit`**. See [NOTICE](NOTICE).

## File-mode (offline libraries)

Not bundled by default. See [docs/file-mode.md](docs/file-mode.md) and [packages/file-ops/README.md](packages/file-ops/README.md).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run MCP server (stdio) |
| `npm test` | Vitest |
| `npm run lint` | `tsc --noEmit` |

## Releases and tags

This repo uses **semantic version** Git tags of the form `vMAJOR.MINOR.PATCH` (for example **`v0.1.0`**), aligned with `package.json` when practical. Check the [tags page](https://github.com/flaco-source/altium-mcp/tags) (or [Releases](https://github.com/flaco-source/altium-mcp/releases)) on GitHub to jump to a specific version.

## Contributing

Issues and pull requests are welcome. This project is **not affiliated with Altium**; keep discussion technical and respectful.

### Before you open a pull request

- Use a **focused branch** and describe **what** changed, **why**, and **how to verify** (manual Altium steps if applicable).
- Run **`npm run build`**, **`npm test`**, and **`npm run lint`** locally. CI runs the same on **Node 22** (see [.github/workflows/ci.yml](.github/workflows/ci.yml)).
- Changes under **`altium-scripts/`** often need a quick check in **Altium Designer on Windows**; state the **AD major version** you used when you can.
- DelphiScript here **builds on upstream work** — follow attribution and licensing notes in [NOTICE](NOTICE) when editing bundled scripts.

### Scope and quality

- Prefer **small, reviewable** PRs. For large refactors or new subsystems, open an **issue first** to agree on direction.
- New or changed **MCP tools** should stay consistent with **`src/toolDefinitions.ts`**, update **JSON schemas** in [`schemas/`](schemas/) when the bridge contract changes, and add or extend **tests** where behavior is verifiable in Node (Vitest).

### License

By contributing, you agree your contributions are licensed under the same terms as this repository — see [LICENSE](LICENSE) (MIT).

## License

MIT — see [LICENSE](LICENSE).
