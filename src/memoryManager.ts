import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface CachedComponent {
  lib_reference: string;
  description: string;
  footprint: string;
  part_count: number;
  designator_template: string;
  projectName: string;
  libraryName: string;
  libraryPath: string;
  sources: string[]; // knowledge base: all libraries containing this component
}

export interface LibraryCatalogEntry {
  libraryName: string;
  libraryPath: string;
  componentCount: number;
  loadedAt: string;
  components: CachedComponent[];
}

export interface LibraryCatalog {
  projectName: string;
  libraries: LibraryCatalogEntry[];
  // Knowledge base unified index (if parsed from new-format catalog)
  kbIndex?: Map<string, CachedComponent>;
  kbStats?: { totalComponents: number; totalLibraries: number };
}

/** Returns the project-root memory/ directory (parent of dist/ or src/). */
function memoryRootDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "memory");
}

/**
 * Parse a unified index table row (knowledge base format).
 */
function parseUnifiedIndexRow(line: string): CachedComponent | null {
  const cols = line.split("|").map((c) => c.trim()).filter((_, idx) => idx > 0 && idx < 7);
  if (cols.length < 5) return null;

  const [libRef, desc, fp, designator, partCount, sourcesStr] = cols;
  const sources = (sourcesStr || "").split(/[;；]/).map((s) => s.trim()).filter(Boolean);

  return {
    lib_reference: libRef,
    description: desc,
    footprint: fp,
    part_count: parseInt(partCount || "1", 10),
    designator_template: designator || "",
    projectName: "",
    libraryName: sources[0] || "",
    libraryPath: "",
    sources: sources.length > 0 ? sources : [sourcesStr || ""],
  };
}

/**
 * Parse a library inventory row (knowledge base format).
 */
function parseLibraryInventoryRow(line: string): {
  libraryName: string;
  libraryPath: string;
  componentCount: number;
  importedAt: string;
} | null {
  const cols = line.split("|").map((c) => c.trim()).filter((_, idx) => idx > 0 && idx < 5);
  if (cols.length < 3) return null;
  const [libName, libPath, compCount, importTime] = cols;
  return {
    libraryName: libName,
    libraryPath: libPath,
    componentCount: parseInt(compCount || "0", 10),
    importedAt: importTime || "",
  };
}

/**
 * Parses a library-catalog.md file into a LibraryCatalog object.
 * Supports both old format (per-library @LIB sections) and new knowledge base format
 * (unified index + library inventory + per-library detail).
 */
function parseCatalogFile(filePath: string, projectName: string): LibraryCatalog | null {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    // Detect format: knowledge base if it has "元件统一索引"
    const isKBFormat = content.includes("元件统一索引");

    if (isKBFormat) {
      // --- Knowledge base format parsing ---
      const kbIndex = new Map<string, CachedComponent>();
      const libraryEntries: LibraryCatalogEntry[] = [];

      // Helper: skip blank lines, table header, and separator after a section heading
      const skipTablePrefix = (startIdx: number): number => {
        let idx = startIdx;
        // Skip blank lines
        while (idx < lines.length && lines[idx].trim() === "") idx++;
        // Skip table header (contains column names like "| lib_reference |")
        if (idx < lines.length && lines[idx].trim().startsWith("|") && !lines[idx].includes("|---")) idx++;
        // Skip separator line
        if (idx < lines.length && lines[idx].includes("|---")) idx++;
        return idx;
      };

      let i = 0;
      while (i < lines.length) {
        const line = lines[i];

        // Parse unified index table
        if (line.includes("元件统一索引") || line.includes("已去重")) {
          i = skipTablePrefix(i + 1);
          while (i < lines.length && lines[i].trim().startsWith("|")) {
            const row = lines[i].trim();
            if (row.includes("|---")) { i++; continue; }
            const comp = parseUnifiedIndexRow(row);
            if (comp) {
              comp.projectName = projectName;
              const key = comp.lib_reference.toLowerCase();
              if (kbIndex.has(key)) {
                const existing = kbIndex.get(key)!;
                for (const s of comp.sources) {
                  if (!existing.sources.includes(s)) existing.sources.push(s);
                }
              } else {
                kbIndex.set(key, comp);
              }
            }
            i++;
          }
          continue;
        }

        // Parse library inventory
        if (line.includes("库清单")) {
          i = skipTablePrefix(i + 1);
          while (i < lines.length && lines[i].trim().startsWith("|")) {
            const row = lines[i].trim();
            if (row.includes("|---")) { i++; continue; }
            const lib = parseLibraryInventoryRow(row);
            if (lib) {
              libraryEntries.push({
                libraryName: lib.libraryName,
                libraryPath: lib.libraryPath,
                componentCount: lib.componentCount,
                loadedAt: lib.importedAt,
                components: [],
              });
            }
            i++;
          }
          continue;
        }

        // Legacy: parse per-library @LIB detail sections for backward compat
        const tsMatch = line.match(/^## MEM:LIB_(?:CATALOG|DETAIL)\s+(.+)$/);
        if (tsMatch) {
          const loadedAt = tsMatch[1].trim();
          i++;
          let libraryName = "";
          let libraryPath = "";
          let componentCount = 0;

          if (i < lines.length) {
            const headerMatch = lines[i].match(/^@LIB\s+(.+?)\s+P:(.+?)\s+N:(\d+)/);
            if (headerMatch) {
              libraryName = headerMatch[1].trim();
              libraryPath = headerMatch[2].trim();
              componentCount = parseInt(headerMatch[3], 10);
            }
            i++;
          }

          while (i < lines.length && lines[i].trim() === "") i++;
          if (i < lines.length && lines[i].includes("| lib_reference |")) i++;
          if (i < lines.length && lines[i].includes("|---")) i++;

          const components: CachedComponent[] = [];
          while (i < lines.length) {
            const rowLine = lines[i].trim();
            if (!rowLine.startsWith("|")) break;
            if (rowLine.includes("|---")) { i++; continue; }

            const cols = rowLine.split("|").map((c) => c.trim()).filter((_, idx) => idx > 0 && idx < 6);
            if (cols.length >= 4) {
              const [libRef, desc, fp, partCount, designator] = cols;
              components.push({
                lib_reference: libRef,
                description: desc,
                footprint: fp,
                part_count: parseInt(partCount || "1", 10),
                designator_template: designator || "",
                projectName,
                libraryName,
                libraryPath,
                sources: [libraryName],
              });
            }
            i++;
          }

          // Only add as a library entry if we don't already have it from the inventory table
          const existingIdx = libraryEntries.findIndex((e) => e.libraryPath === libraryPath);
          if (existingIdx < 0 && libraryName) {
            libraryEntries.push({
              libraryName,
              libraryPath,
              componentCount,
              loadedAt,
              components,
            });
          } else if (existingIdx >= 0 && components.length > 0) {
            // Enrich existing entry with component details from detail section
            if (libraryEntries[existingIdx].components.length === 0) {
              libraryEntries[existingIdx].components = components;
            }
          }
        } else {
          i++;
        }
      }

      if (kbIndex.size === 0 && libraryEntries.length === 0) return null;
      return {
        projectName,
        libraries: libraryEntries,
        kbIndex,
        kbStats: {
          totalComponents: kbIndex.size,
          totalLibraries: libraryEntries.length,
        },
      };
    }

    // --- Legacy format parsing (original per-library sections) ---
    const libraries: LibraryCatalogEntry[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const tsMatch = line.match(/^## MEM:LIB_CATALOG\s+(.+)$/);
      if (tsMatch) {
        const loadedAt = tsMatch[1].trim();
        i++;

        let libraryName = "";
        let libraryPath = "";
        let componentCount = 0;

        if (i < lines.length) {
          const headerMatch = lines[i].match(/^@LIB\s+(.+?)\s+P:(.+?)\s+N:(\d+)/);
          if (headerMatch) {
            libraryName = headerMatch[1].trim();
            libraryPath = headerMatch[2].trim();
            componentCount = parseInt(headerMatch[3], 10);
          }
          i++;
        }

        while (i < lines.length && lines[i].trim() === "") i++;
        if (i < lines.length && lines[i].includes("| lib_reference |")) i++;
        if (i < lines.length && lines[i].includes("|---")) i++;

        const components: CachedComponent[] = [];
        while (i < lines.length) {
          const rowLine = lines[i].trim();
          if (!rowLine.startsWith("|")) break;
          if (rowLine.includes("|---")) { i++; continue; }

          const cols = rowLine.split("|").map((c) => c.trim()).filter((_, idx) => idx > 0 && idx < 6);
          if (cols.length >= 4) {
            const [libRef, desc, fp, partCount, designator] = cols;
            components.push({
              lib_reference: libRef,
              description: desc,
              footprint: fp,
              part_count: parseInt(partCount || "1", 10),
              designator_template: designator || "",
              projectName,
              libraryName,
              libraryPath,
              sources: [libraryName],
            });
          }
          i++;
        }

        libraries.push({ libraryName, libraryPath, componentCount, loadedAt, components });
      } else {
        i++;
      }
    }

    if (libraries.length === 0) return null;
    return { projectName, libraries };
  } catch {
    return null;
  }
}

/**
 * MemoryManager: auto-loads library catalogs from memory/short-term/ on startup
 * and provides fast in-memory search with library-level distinction.
 *
 * Supports both legacy (per-library sections) and knowledge base (unified deduplicated index) formats.
 */
export class MemoryManager {
  private catalogs: Map<string, LibraryCatalog> = new Map();
  private componentIndex: Map<string, CachedComponent[]> = new Map();
  private memoryDir: string;

  constructor() {
    this.memoryDir = memoryRootDir();
    this.loadAll();
  }

  /** (Re)load all library-catalog.md files from memory/short-term/*/ 
  loadAll(): number {
    this.catalogs.clear();
    this.componentIndex.clear();

    const shortTermDir = join(this.memoryDir, "short-term");
    if (!existsSync(shortTermDir)) return 0;

    let loaded = 0;
    try {
      const projectDirs = readdirSync(shortTermDir).filter((d) => {
        const fullPath = join(shortTermDir, d);
        try {
          return statSync(fullPath).isDirectory();
        } catch {
          return false;
        }
      });

      for (const projectDir of projectDirs) {
        const catalogFile = join(shortTermDir, projectDir, "library-catalog.md");
        if (!existsSync(catalogFile)) continue;

        const catalog = parseCatalogFile(catalogFile, projectDir);
        if (!catalog) continue;

        this.catalogs.set(projectDir, catalog);

        if (catalog.kbIndex) {
          // Knowledge base format: index by lib_reference from unified index
          for (const [key, comp] of catalog.kbIndex) {
            if (!this.componentIndex.has(key)) {
              this.componentIndex.set(key, []);
            }
            // Set project context
            comp.projectName = projectDir;
            this.componentIndex.get(key)!.push(comp);
          }
        } else {
          // Legacy format: index from per-library sections
          for (const lib of catalog.libraries) {
            for (const comp of lib.components) {
              const key = comp.lib_reference.toLowerCase();
              if (!this.componentIndex.has(key)) {
                this.componentIndex.set(key, []);
              }
              this.componentIndex.get(key)!.push(comp);
            }
          }
        }
        loaded++;
      }
    } catch {
      // Silently ignore read errors
    }

    return loaded;
  }

  /** Search cached components by symbol name (case-insensitive, partial match). */
  searchBySymbol(symbolName: string): {
    found: boolean;
    matches: CachedComponent[];
    total_cached: number;
  } {
    const query = symbolName.toLowerCase().trim();
    const matches: CachedComponent[] = [];
    const seen = new Set<string>(); // dedup across componentIndex entries

    // Exact match first
    const exactMatches = this.componentIndex.get(query);
    if (exactMatches) {
      for (const comp of exactMatches) {
        const dedupKey = `${comp.lib_reference}|${comp.sources.join(",")}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          matches.push(comp);
        }
      }
    }

    // Partial match (prefix/substring)
    for (const [key, components] of this.componentIndex.entries()) {
      if (key !== query && (key.startsWith(query) || key.includes(query))) {
        for (const comp of components) {
          const dedupKey = `${comp.lib_reference}|${comp.sources.join(",")}`;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            matches.push(comp);
          }
        }
      }
    }

    const totalCached = Array.from(this.componentIndex.values()).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );

    return {
      found: matches.length > 0,
      matches,
      total_cached: totalCached,
    };
  }

  /** Get a catalog for a specific project. */
  getCatalog(projectName: string): LibraryCatalog | undefined {
    return this.catalogs.get(projectName);
  }

  /** Get all loaded catalogs (metadata only, no components). */
  listCatalogs(): Array<{
    projectName: string;
    libraries: Array<Omit<LibraryCatalogEntry, "components">>;
    kbStats?: { totalComponents: number; totalLibraries: number };
  }> {
    return Array.from(this.catalogs.values()).map((c) => ({
      projectName: c.projectName,
      libraries: c.libraries.map(({ components: _, ...meta }) => meta),
      kbStats: c.kbStats,
    }));
  }

  /** Get total number of unique cached components (knowledge base aware). */
  getTotalComponents(): number {
    // Count unique lib_references (knowledge base dedup)
    const uniqueRefs = new Set<string>();
    for (const comps of this.componentIndex.values()) {
      for (const c of comps) {
        uniqueRefs.add(c.lib_reference.toLowerCase());
      }
    }
    return uniqueRefs.size;
  }

  /** Get total raw component entries (including duplicates across libraries). */
  getTotalRawEntries(): number {
    return Array.from(this.componentIndex.values()).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
  }

  /** Check if any catalog is loaded. */
  isEmpty(): boolean {
    return this.catalogs.size === 0;
  }
}

// Singleton instance
let instance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!instance) {
    instance = new MemoryManager();
  }
  return instance;
}