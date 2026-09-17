/**
 * Optional: mirror altium-scripts into the MCP workspace when fingerprint differs.
 * Run manually: `npm run sync-workspace` (after `npm run build`). The MCP also
 * mirrors on startup and before each bridge command when the bundle changed.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distLayout = join(root, "dist", "workspaceLayout.js");
const distConfig = join(root, "dist", "config.js");

if (!existsSync(distLayout)) {
  console.error(
    "[altium-mcp] sync-altium-workspace: dist/ missing; run `npm run build` (tsc) first.",
  );
  process.exit(0);
}

const { ensureAltiumScriptBundle } = await import(
  pathToFileURL(distLayout).href,
);
const { loadUserConfig, resolveWorkspaceRoot } = await import(
  pathToFileURL(distConfig).href,
);

const bundledScriptsDir = join(root, "altium-scripts");
const workspaceRoot = resolveWorkspaceRoot(loadUserConfig());

ensureAltiumScriptBundle(workspaceRoot, bundledScriptsDir);
console.error(
  `[altium-mcp] AltiumScript bundle checked → ${join(workspaceRoot, "AltiumScript")}`,
);
