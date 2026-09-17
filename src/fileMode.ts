/**
 * File-mode (offline) operations: optional Rust sidecar or third-party parsers.
 * @see docs/file-mode.md
 */

export interface FileModeCapabilities {
  readPcbLib: boolean;
  writePcbLib: boolean;
  readSchLib: boolean;
  writeSchLib: boolean;
  notes: string;
}

export function getFileModeCapabilities(): FileModeCapabilities {
  return {
    readPcbLib: false,
    writePcbLib: false,
    readSchLib: false,
    writeSchLib: false,
    notes:
      "File-mode parsing is not bundled in this release. Use live Altium bridge tools with Altium Designer open, or integrate embedded-society/altium-designer-mcp (Rust) as a sidecar and wire tools here.",
  };
}
