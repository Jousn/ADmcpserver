# File-mode footprint (optional extension)

This directory is reserved for a future **offline** path that reads and writes
Altium `.PcbLib` / `.SchLib` without running Altium Designer.

## Recommended direction

- Evaluate [embedded-society/altium-designer-mcp](https://github.com/embedded-society/altium-designer-mcp) (Rust) as a **sidecar binary** invoked from the TypeScript MCP server.
- Expose thin MCP tools (`read_pcblib`, `write_pcblib`, etc.) that serialize JSON to stdin/stdout of the sidecar.

## Why not in-tree yet

- Licensing and release cadence should be decided explicitly before vendoring or submoduling Rust sources.
- Keeps the default install a single Node.js runtime plus Altium on Windows.

The tool `file_mode_capabilities` in the MCP server reports whether this build includes file-mode support.
