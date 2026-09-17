import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_BASE = "C:\\Program Files\\Altium";

/**
 * Picks the newest AD* folder under Program Files\Altium that contains X2.EXE.
 */
export function discoverAltiumExe(baseDir: string = DEFAULT_BASE): string | undefined {
  try {
    if (!existsSync(baseDir)) return undefined;
    const entries = readdirSync(baseDir, { withFileTypes: true });
    let best: { path: string; mtime: number } | undefined;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!e.name.toUpperCase().startsWith("AD")) continue;
      const candidate = join(baseDir, e.name, "X2.EXE");
      if (!existsSync(candidate)) continue;
      const mtime = statSync(candidate).mtimeMs;
      if (!best || mtime > best.mtime) {
        best = { path: candidate, mtime };
      }
    }
    return best?.path;
  } catch {
    return undefined;
  }
}
