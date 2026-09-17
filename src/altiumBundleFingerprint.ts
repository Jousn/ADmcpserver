import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Written into workspace AltiumScript after sync; not part of repo bundle. */
export const ALTIUM_BUNDLE_FINGERPRINT_FILENAME = ".mcp-bundle.sha256";

/** All file paths under the bundle root, sorted by relative path (for fingerprint + mirror). */
export function listBundledScriptAbsPathsSorted(
  bundledScriptsDir: string,
): string[] {
  if (!existsSync(bundledScriptsDir)) {
    throw new Error(`bundledScriptsDir not found: ${bundledScriptsDir}`);
  }
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(bundledScriptsDir);
  return out.sort((a, b) =>
    relative(bundledScriptsDir, a).localeCompare(
      relative(bundledScriptsDir, b),
      "en",
    ),
  );
}

/**
 * Stable fingerprint over all files under bundledScriptsDir (paths + contents).
 * Any script change in the repo invalidates the workspace copy.
 */
export function computeBundledAltiumScriptsFingerprint(
  bundledScriptsDir: string,
): string {
  const h = createHash("sha256");
  for (const abs of listBundledScriptAbsPathsSorted(bundledScriptsDir)) {
    const rel = relative(bundledScriptsDir, abs).split("\\").join("/");
    h.update(rel);
    h.update("\0");
    h.update(readFileSync(abs));
    h.update("\0");
  }
  return h.digest("hex");
}
