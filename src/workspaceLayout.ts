import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  ALTIUM_BUNDLE_FINGERPRINT_FILENAME,
  computeBundledAltiumScriptsFingerprint,
  listBundledScriptAbsPathsSorted,
} from "./altiumBundleFingerprint.js";

export interface EnsureAltiumScriptBundleOptions {
  /** When true, mirror again even if the fingerprint matches (e.g. repaired workspace). */
  force?: boolean;
}

function walkFileAbsPaths(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * Update workspace/AltiumScript in place: copy/overwrite bundle files, remove extras.
 * Avoids deleting the whole folder so Altium keeps a stable path to the script project.
 */
function mirrorBundledScriptsToDest(
  bundledScriptsDir: string,
  dest: string,
  currentFingerprint: string,
): void {
  mkdirSync(dest, { recursive: true });

  const bundleAbs = listBundledScriptAbsPathsSorted(bundledScriptsDir);
  const relSet = new Set<string>();
  for (const abs of bundleAbs) {
    const rel = relative(bundledScriptsDir, abs).split("\\").join("/");
    relSet.add(rel);
    const target = join(dest, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(abs, target);
  }

  if (existsSync(dest)) {
    for (const abs of walkFileAbsPaths(dest)) {
      const rel = relative(dest, abs).split("\\").join("/");
      if (rel === ALTIUM_BUNDLE_FINGERPRINT_FILENAME) continue;
      if (!relSet.has(rel)) {
        try {
          unlinkSync(abs);
        } catch {
          /* ignore */
        }
      }
    }
  }

  writeFileSync(
    join(dest, ALTIUM_BUNDLE_FINGERPRINT_FILENAME),
    `${currentFingerprint}\n`,
    "utf8",
  );
}

/**
 * Ensures workspace/AltiumScript mirrors bundledScriptsDir when bundle content changes.
 * Uses a content fingerprint so Altium touching file mtimes in the workspace does not block updates.
 */
export function ensureAltiumScriptBundle(
  workspaceRoot: string,
  bundledScriptsDir: string,
  options?: EnsureAltiumScriptBundleOptions,
): void {
  mkdirSync(workspaceRoot, { recursive: true });

  const dest = join(workspaceRoot, "AltiumScript");
  const marker = join(dest, "Altium_API.PrjScr");
  const stateFile = join(dest, ALTIUM_BUNDLE_FINGERPRINT_FILENAME);

  let currentFingerprint: string;
  try {
    currentFingerprint =
      computeBundledAltiumScriptsFingerprint(bundledScriptsDir);
  } catch {
    return;
  }

  const force = options?.force === true;
  let needsSync = true;
  if (!force && existsSync(marker) && existsSync(stateFile)) {
    try {
      const previous = readFileSync(stateFile, "utf8").trim();
      if (previous === currentFingerprint) needsSync = false;
    } catch {
      needsSync = true;
    }
  }

  if (!needsSync) return;

  mirrorBundledScriptsToDest(bundledScriptsDir, dest, currentFingerprint);
}

export function scriptProjectPath(workspaceRoot: string): string {
  return join(workspaceRoot, "AltiumScript", "Altium_API.PrjScr");
}
