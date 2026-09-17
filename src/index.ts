#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AltiumBridge,
  defaultBundledScriptsDir,
  readBridgeDiagnosticSnippets,
} from "./bridge/altiumBridge.js";
import { getFileModeCapabilities } from "./fileMode.js";
import { ALTIUM_MCP_INSTRUCTIONS } from "./mcpInstructions.js";
import {
  annotationsConfigWrite,
  annotationsNodeOnly,
  annotationsPcbWrite,
  annotationsOutputGenerate,
  annotationsReadOnlyLive,
  annotationsSchematicEdit,
  DESCRIPTION_ALTIUM_PING,
  DESCRIPTION_CONFIGURE_ALTIUM_EXE,
  DESCRIPTION_CREATE_NET_CLASS,
  DESCRIPTION_CREATE_SCHEMATIC_SYMBOL,
  DESCRIPTION_EDIT_SCHEMATIC,
  DESCRIPTION_FILE_MODE_CAPABILITIES,
  DESCRIPTION_GET_ALL_DESIGNATORS,
  DESCRIPTION_GET_ALL_NETS,
  DESCRIPTION_GET_COMPONENT_PINS,
  DESCRIPTION_GET_LIBRARY_SYMBOL_REFERENCE,
  DESCRIPTION_GET_OUTPUT_JOB_CONTAINERS,
  DESCRIPTION_GET_PCB_LAYERS,
  DESCRIPTION_GET_PCB_LAYER_STACKUP,
  DESCRIPTION_GET_PCB_RULES,
  DESCRIPTION_GET_SCHEMATIC_DATA,
  DESCRIPTION_GET_SELECTED_COMPONENTS,
  DESCRIPTION_GET_SERVER_STATUS,
  DESCRIPTION_GET_WORKSPACE_PROJECTS,
  DESCRIPTION_IMPORT_LIBRARY_COMPONENTS,
  DESCRIPTION_LAYOUT_DUPLICATOR,
  DESCRIPTION_LAYOUT_DUPLICATOR_APPLY,
  DESCRIPTION_MOVE_COMPONENTS,
  DESCRIPTION_RUN_OUTPUT_JOBS,
  DESCRIPTION_SEARCH_LIBRARY_SYMBOL,
  DESCRIPTION_SET_COMPONENT_POSITION,
  DESCRIPTION_SET_PCB_LAYER_VISIBILITY,
  DESCRIPTION_TAKE_VIEW_SCREENSHOT,
  DESCRIPTION_PCB_EDIT,
  DESCRIPTION_COMPILE_PROJECT,
  DESCRIPTION_OPEN_DOCUMENT,
  DESCRIPTION_ZOOM_VIEW,
  DESCRIPTION_PCB_COMPONENT,
  DESCRIPTION_PCB_DRC,
  DESCRIPTION_PCB_BOARD_INFO,
  DESCRIPTION_PCB_POLYGON_INFO,
  DESCRIPTION_PCB_NET_INFO,
  DESCRIPTION_OVERLAP_REPORT,
  DESCRIPTION_GENERATE_REPORT,
  DESCRIPTION_CHECK_CONNECTIVITY,
  DESCRIPTION_ANALYZE_SCHEMATIC_QUALITY,
  DESCRIPTION_WIRE_PINS,
  DESCRIPTION_OPTIMIZE_LAYOUT,
  DESCRIPTION_PIN_TABLE,
  DESCRIPTION_VALIDATE_NETLIST,
  DESCRIPTION_INSTANTIATE_MODULE,
  DESCRIPTION_LIST_MODULE_TEMPLATES,
} from "./toolDefinitions.js";
import { editSchematicInputSchema } from "./tools/editSchematic.js";
import { getSchematicDataInputSchema } from "./tools/getSchematicData.js";
import {
  checkConnectivityInputSchema,
  analyzeConnectivity,
} from "./tools/checkConnectivity.js";
import {
  analyzeSchematicQuality,
  analyzeSchematicQualityInputSchema,
} from "./tools/analyzeSchematicQuality.js";
import { fetchSchematicAuditData } from "./tools/schematicAuditData.js";
import { wirePinsInputSchema, runWirePins } from "./tools/wirePins.js";
import { optimizeLayoutInputSchema, runOptimizeLayout } from "./tools/optimizeLayout.js";
import { buildPinTable, fetchLibraryComponents, pinTableInputSchema, runPinTable } from "./tools/pinTable.js";
import { anchoredOrigin } from "./tools/moduleTemplates.js";
import { validateNetlistInputSchema, runValidateNetlist } from "./tools/validateNetlist.js";
import { instantiateModuleInputSchema, runInstantiateModule, listModuleTemplatesInputSchema, runListModuleTemplates } from "./tools/instantiateModule.js";
import { parseDesignatorsFromComponentData } from "./tools/designators.js";
import { errResult, jsonResult } from "./tools/helpers.js";
import { getMemoryManager } from "./memoryManager.js";
import {
  searchKnowledgeBase,
  listKnowledgeBaseCategories,
  getKnowledgeBaseStats,
} from "./knowledge-base/kbSearch.js";

const bridge = new AltiumBridge({
  bundledScriptsDir: defaultBundledScriptsDir(),
});

// #region Feature flags — set to true to re-enable write operations.
// Per architecture plan: AI advisory tools (reads, library catalog, memory) stay enabled;
// design-write operations are hidden because production-grade editing belongs to AD plugins.
const ENABLE_SCHEMATIC_WRITES = true;  // edit_schematic (place/move/wire/... on .SchDoc)
const ENABLE_PCB_WRITES = true;        // set_component_position, move_components, create_net_class, set_pcb_layer_visibility, layout_duplicator_apply, pcb_edit
const ENABLE_SYMBOL_CREATION = false;  // create_schematic_symbol
// #endregion

// Auto-load memory caches on startup
const memoryMgr = getMemoryManager();
const initialCatalogs = memoryMgr.listCatalogs();
if (initialCatalogs.length > 0) {
  console.error(`[memory] Auto-loaded ${initialCatalogs.length} catalog(s), ${memoryMgr.getTotalComponents()} component(s)`);
}

const server = new McpServer(
  {
    name: "altium-mcp",
    version: "0.1.0",
  },
  {
    instructions: ALTIUM_MCP_INSTRUCTIONS,
  },
);

server.registerTool(
  "get_server_status",
  {
    title: "Altium MCP server status",
    description: DESCRIPTION_GET_SERVER_STATUS,
    annotations: annotationsReadOnlyLive,
    inputSchema: z.object({}),
  },
  async () => {
    bridge.ensureLayout();
    const exe = bridge.resolveAltiumExePath();
    const script = bridge.getScriptProjectPath();
    const diag = readBridgeDiagnosticSnippets(bridge.workspaceRoot);
    const data = {
      platform: process.platform,
      workspaceRoot: bridge.workspaceRoot,
      requestPath: bridge.getRequestPath(),
      responsePath: bridge.getResponsePath(),
      scriptProjectPath: script,
      altiumExePath: exe ?? null,
      altiumExeFound: exe ? existsSync(exe) : false,
      scriptProjectFound: existsSync(script),
      bundledScriptsDir: defaultBundledScriptsDir(),
      bridgeLastError: diag.bridgeLastError,
      bridgeUserReportedError: diag.bridgeUserReportedError,
      diagnosticsHint:
        "On Altium script compile/runtime errors: paste Messages panel text into workspace file bridge_user_reported_error.txt (UTF-8), then call get_server_status again. bridge_last_error.txt is written by the bridge on failed responses.",
      env: {
        ALTIUM_MCP_WORKSPACE: process.env.ALTIUM_MCP_WORKSPACE ?? null,
        ALTIUM_MCP_ALTIUM_EXE: process.env.ALTIUM_MCP_ALTIUM_EXE ?? null,
      },
    };
    return jsonResult(data);
  },
);

server.registerTool(
  "configure_altium_exe",
  {
    title: "Save Altium X2.EXE path",
    description: DESCRIPTION_CONFIGURE_ALTIUM_EXE,
    annotations: annotationsConfigWrite,
    inputSchema: {
      path: z
        .string()
        .describe(
          "Absolute path to Altium X2.EXE on disk (must exist). Example: C:\\Program Files\\Altium\\AD25\\X2.EXE",
        ),
    },
  },
  async ({ path: exePath }) => {
    if (!existsSync(exePath)) {
      return errResult(`File not found: ${exePath}`);
    }
    bridge.persistAltiumExePath(exePath);
    return jsonResult({ ok: true, altiumExePath: exePath });
  },
);

server.registerTool(
  "altium_ping",
  {
    title: "Ping Altium bridge",
    description: DESCRIPTION_ALTIUM_PING,
    annotations: annotationsReadOnlyLive,
    inputSchema: z.object({}),
  },
  async () => {
    const r = await bridge.executeCommand("ping", {});
    return jsonResult(r);
  },
);

registerLiveCommand(
  "get_workspace_projects",
  "Workspace projects and files",
  DESCRIPTION_GET_WORKSPACE_PROJECTS,
  "list_workspace",
  {},
  annotationsReadOnlyLive,
);

server.registerTool(
  "get_schematic_data",
  {
    title: "Schematic sheet (filtered export)",
    description: DESCRIPTION_GET_SCHEMATIC_DATA,
    annotations: annotationsReadOnlyLive,
    inputSchema: getSchematicDataInputSchema,
  },
  async (params) => {
    const r = await bridge.executeCommand(
      "get_schematic_data",
      params as Record<string, unknown>,
    );
    return jsonResult(r);
  },
);

server.registerTool(
  "check_connectivity",
  {
    title: "Schematic connectivity audit (shorts / floats / junctions)",
    description: DESCRIPTION_CHECK_CONNECTIVITY,
    annotations: annotationsReadOnlyLive,
    inputSchema: checkConnectivityInputSchema,
  },
  async (params) => {
    const sheet: Record<string, unknown> = {};
    if (params.schematic_full_path) sheet.schematic_full_path = params.schematic_full_path;
    if (params.project_full_path) sheet.project_full_path = params.project_full_path;
    if (params.schematic_sheet_file_name)
      sheet.schematic_sheet_file_name = params.schematic_sheet_file_name;

    const data = await fetchSchematicAuditData(bridge, sheet);
    const report = analyzeConnectivity(data);
    if (!data.dmAvailable) {
      report.warnings.push({
        code: "DM_LAYER_UNAVAILABLE",
        message: `Compiled-data layer unavailable (${data.dmError ?? "unknown"}); analysis ran in geometry-fallback mode. Net short/float verdicts are less authoritative — try compile_project first.`,
      });
      report.summary.warnings = report.warnings.length;
    }
    return jsonResult(report);
  },
);

server.registerTool(
  "analyze_schematic_quality",
  {
    title: "Schematic drawing-quality prediction (crossings / bends / detours)",
    description: DESCRIPTION_ANALYZE_SCHEMATIC_QUALITY,
    annotations: annotationsReadOnlyLive,
    inputSchema: analyzeSchematicQualityInputSchema,
  },
  async (params) => {
    const sheet: Record<string, unknown> = {};
    if (params.schematic_full_path) sheet.schematic_full_path = params.schematic_full_path;
    if (params.project_full_path) sheet.project_full_path = params.project_full_path;
    if (params.schematic_sheet_file_name)
      sheet.schematic_sheet_file_name = params.schematic_sheet_file_name;

    const data = await fetchSchematicAuditData(bridge, sheet);
    const report = analyzeSchematicQuality(data, {
      transforms: params.transforms,
      suggestRotations: params.suggest_rotations ?? true,
    });
    return jsonResult(report);
  },
);

// ---------------------------------------------------------------------------
// Stage-1 planning tools: pin definitions + netlist validation (read-only)
// ---------------------------------------------------------------------------

server.registerTool(
  "pin_table",
  {
    title: "Library pin definitions for planning (pre-placement)",
    description: DESCRIPTION_PIN_TABLE,
    annotations: annotationsReadOnlyLive,
    inputSchema: pinTableInputSchema,
  },
  async (params) => jsonResult(await runPinTable(bridge, params)),
);

server.registerTool(
  "validate_netlist",
  {
    title: "Golden-netlist validation (hallucinated pins / coverage / shorts)",
    description: DESCRIPTION_VALIDATE_NETLIST,
    annotations: annotationsReadOnlyLive,
    inputSchema: validateNetlistInputSchema,
  },
  async (params) => jsonResult(await runValidateNetlist(bridge, params)),
);

if (ENABLE_SCHEMATIC_WRITES) {
  server.registerTool(
    "instantiate_module",
    {
      title: "Instantiate a module template onto a sheet (one-call block generation)",
      description: DESCRIPTION_INSTANTIATE_MODULE,
      annotations: annotationsSchematicEdit,
      inputSchema: instantiateModuleInputSchema,
    },
    async (params) => jsonResult(await runInstantiateModule(bridge, params)),
  );
}

server.registerTool(
  "list_module_templates",
  {
    title: "List available module templates",
    description: DESCRIPTION_LIST_MODULE_TEMPLATES,
    annotations: annotationsNodeOnly,
    inputSchema: listModuleTemplatesInputSchema,
  },
  async () => jsonResult(runListModuleTemplates()),
);

// ---------------------------------------------------------------------------
// Schematic write operations — gated by feature flag
// ---------------------------------------------------------------------------

if (ENABLE_SCHEMATIC_WRITES) {
  server.registerTool(
    "edit_schematic",
    {
      title: "Edit schematic sheet",
      description: DESCRIPTION_EDIT_SCHEMATIC,
      annotations: annotationsSchematicEdit,
      inputSchema: editSchematicInputSchema,
    },
    async (params) => {
      const p = params as Record<string, unknown>;
      // anchor-pin placement: rewrite x/y so the named pin hotspot lands on
      // them (origin lands wherever the symbol geometry dictates)
      if (p.action === "place_component" && typeof p.anchor_pin === "string" && p.anchor_pin !== "") {
        const lib = String(p.lib_reference ?? "");
        const rot = Number(p.rotation_deg ?? 0);
        const tx = p.x_mils;
        const ty = p.y_mils;
        if (!lib || typeof tx !== "number" || typeof ty !== "number") {
          return errResult("anchor_pin placement requires lib_reference + x_mils + y_mils");
        }
        const fetched = await fetchLibraryComponents(bridge);
        if (!fetched.ok) return errResult(`anchor_pin: cannot read libraries: ${fetched.error}`);
        const { matched } = buildPinTable(fetched.components, [lib]);
        const wanted = String(p.anchor_pin).toLowerCase();
        const pin = matched[0]?.pins.find((q) => q.number.toLowerCase() === wanted);
        if (!pin) return errResult(`anchor_pin "${String(p.anchor_pin)}" not found on ${lib}`);
        const o = anchoredOrigin(pin, rot, { x: tx, y: ty });
        p.x_mils = Math.round(o.x);
        p.y_mils = Math.round(o.y);
        delete p.anchor_pin;
      }
      const r = await bridge.executeCommand("schematic_edit", p, { timeoutMs: 240_000 });
      return jsonResult(r);
    },
  );

  server.registerTool(
    "wire_pins",
    {
      title: "Wire one net by pin list (topology in, routed wires out)",
      description: DESCRIPTION_WIRE_PINS,
      annotations: annotationsSchematicEdit,
      inputSchema: wirePinsInputSchema,
    },
    async (params) => jsonResult(await runWirePins(bridge, params)),
  );

  server.registerTool(
    "optimize_layout",
    {
      title: "Optimize schematic placement + rewire (netlist-preserving)",
      description: DESCRIPTION_OPTIMIZE_LAYOUT,
      annotations: annotationsSchematicEdit,
      inputSchema: optimizeLayoutInputSchema,
    },
    async (params) => jsonResult(await runOptimizeLayout(bridge, params)),
  );
}

function registerLiveCommand(
  name: string,
  title: string,
  description: string,
  command: string,
  shape: z.ZodRawShape = {},
  annotations?: ToolAnnotations,
) {
  server.registerTool(
    name,
    {
      title,
      description,
      annotations,
      inputSchema: z.object(shape),
    },
    async (params) => {
      const r = await bridge.executeCommand(command, params as Record<string, unknown>);
      return jsonResult(r);
    },
  );
}

// ---------------------------------------------------------------------------
// Library catalog → memory persistence (import_library_components)
// ---------------------------------------------------------------------------

/** memory/ folder lives at the MCP project root (parent of dist/). */
function memoryRootDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/ or src/
  return join(here, "..", "memory");
}

/**
 * Derive a project name for memory paths. Prefer the focused project's file
 * basename (no extension); fall back to the library file's parent directory
 * name. Both yield a stable folder under memory/short-term/{project}/.
 */
function resolveProjectName(projectPath: string, libraryPath: string): string {
  if (projectPath) {
    const base = basename(projectPath);
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
  }
  if (libraryPath) {
    return basename(dirname(libraryPath));
  }
  return "default";
}

interface LibraryComponent {
  lib_reference: string;
  description: string;
  designator_template: string;
  part_count: number;
  footprint: string;
}

interface LibraryComponentsResult {
  library_path: string;
  library_name: string;
  project_path: string;
  component_count: number;
  jsonl_file?: string;
  components?: LibraryComponent[]; // legacy: present when not streaming
}

/**
 * Knowledge-base style catalog entry in the unified index.
 */
interface KBComponentEntry {
  lib_reference: string;
  description: string;
  footprint: string;
  designator_template: string;
  part_count: number;
  sources: string[]; // library names this component comes from
}

interface KBLibraryEntry {
  libraryName: string;
  libraryPath: string;
  componentCount: number;
  importedAt: string;
}

/**
 * Parse existing library-catalog.md to extract the unified index and library inventory.
 * Returns the parsed state for merging.
 */
function parseExistingCatalog(filePath: string): {
  kbIndex: Map<string, KBComponentEntry>;
  libInventory: KBLibraryEntry[];
} {
  const kbIndex = new Map<string, KBComponentEntry>();
  const libInventory: KBLibraryEntry[] = [];

  if (!existsSync(filePath)) return { kbIndex, libInventory };

  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    let i = 0;

    // Helper: skip blank lines, table header, and separator line
    const skipTablePrefix = (startIdx: number): number => {
      let idx = startIdx;
      // Skip blank lines
      while (idx < lines.length && lines[idx].trim() === "") idx++;
      // Skip table header (column names row)
      if (idx < lines.length && lines[idx].trim().startsWith("|") && !lines[idx].includes("|---")) idx++;
      // Skip separator line
      if (idx < lines.length && lines[idx].includes("|---")) idx++;
      return idx;
    };

    while (i < lines.length) {
      const line = lines[i];

      // Parse unified index table
      if (line.includes("元件统一索引") || line.includes("已去重")) {
        i = skipTablePrefix(i + 1);
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          const row = lines[i].trim();
          if (row.includes("|---")) { i++; continue; }
          const cols = row.split("|").map((c) => c.trim()).filter((_, idx) => idx > 0 && idx < 7);
          if (cols.length >= 5) {
            const [libRef, desc, fp, designator, partCount, sourcesStr] = cols;
            const key = libRef.toLowerCase();
            kbIndex.set(key, {
              lib_reference: libRef,
              description: desc,
              footprint: fp,
              designator_template: designator,
              part_count: parseInt(partCount || "1", 10),
              sources: (sourcesStr || "").split(/[;；]/).map((s) => s.trim()).filter(Boolean),
            });
          }
          i++;
        }
        continue;
      }

      // Parse library inventory table
      if (line.includes("库清单")) {
        i = skipTablePrefix(i + 1);
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          const row = lines[i].trim();
          if (row.includes("|---")) { i++; continue; }
          const cols = row.split("|").map((c) => c.trim()).filter((_, idx) => idx > 0 && idx < 5);
          if (cols.length >= 3) {
            const [libName, libPath, compCount, importTime] = cols;
            libInventory.push({
              libraryName: libName,
              libraryPath: libPath,
              componentCount: parseInt(compCount || "0", 10),
              importedAt: importTime || "",
            });
          }
          i++;
        }
        continue;
      }

      i++;
    }
  } catch {
    // Silently ignore parse errors
  }

  return { kbIndex, libInventory };
}

/**
 * Stream-write the per-library catalog to memory/short-term/{project}/library-catalog.md.
 * Knowledge-base style: unified deduplicated component index + library inventory + per-library details.
 *
 * Import logic:
 * - Same lib_reference from same library → update existing entry
 * - Same lib_reference from different library → add new source, keep existing info
 * - New lib_reference → add new entry
 * - Same library_path → update existing library's timestamp and count
 */
function writeShortTermCatalog(
  projectName: string,
  data: LibraryComponentsResult,
  jsonlFilePath?: string,
): { filePath: string; sampleComponents: LibraryComponent[] } {
  const dir = join(memoryRootDir(), "short-term", projectName);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "library-catalog.md");
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);

  // Collect components from JSONL or legacy data
  const components: LibraryComponent[] = [];
  if (jsonlFilePath && existsSync(jsonlFilePath)) {
    const content = readFileSync(jsonlFilePath, "utf8").trim();
    if (content) {
      const wrapped = `[${content.replace(/}\s*{/g, "},{")}]`;
      try {
        const parsed = JSON.parse(wrapped);
        if (Array.isArray(parsed)) {
          components.push(...(parsed as LibraryComponent[]));
        }
      } catch {
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              components.push(JSON.parse(trimmed) as LibraryComponent);
            } catch {
              // Skip
            }
          }
        }
      }
    }
  } else if (data.components) {
    components.push(...data.components);
  }

  // Load existing catalog state
  const { kbIndex, libInventory } = parseExistingCatalog(filePath);

  // Merge new components into unified index
  const newSource = data.library_name;
  let addedCount = 0;
  let updatedCount = 0;

  for (const comp of components) {
    const key = comp.lib_reference.toLowerCase();
    const existing = kbIndex.get(key);

    if (existing) {
      // Update existing entry
      if (!existing.sources.includes(newSource)) {
        existing.sources.push(newSource);
      }
      // Update fields if new data is more complete
      if (comp.description && comp.description.trim()) existing.description = comp.description;
      if (comp.footprint && comp.footprint.trim()) existing.footprint = comp.footprint;
      if (comp.designator_template && comp.designator_template.trim()) existing.designator_template = comp.designator_template;
      if (comp.part_count) existing.part_count = comp.part_count;
      updatedCount++;
    } else {
      // New component
      kbIndex.set(key, {
        lib_reference: comp.lib_reference,
        description: comp.description || "",
        footprint: comp.footprint || "",
        designator_template: comp.designator_template || "",
        part_count: comp.part_count || 1,
        sources: [newSource],
      });
      addedCount++;
    }
  }

  // Update library inventory
  const existingLibIdx = libInventory.findIndex((lib) => lib.libraryPath === data.library_path);
  if (existingLibIdx >= 0) {
    libInventory[existingLibIdx].componentCount = data.component_count;
    libInventory[existingLibIdx].importedAt = ts;
  } else {
    libInventory.push({
      libraryName: data.library_name,
      libraryPath: data.library_path,
      componentCount: data.component_count,
      importedAt: ts,
    });
  }

  // --- Build the new catalog file ---
  const output: string[] = [];

  // Header
  output.push(`# ${projectName} 库元件知识库`);
  output.push("");
  output.push("> 由 import_library_components 工具生成。这是一个去重后的元件知识库，按 lib_reference 统一索引，同时追踪每个元件的来源库。");
  output.push("> 查找元件时，先查下方统一索引表，确认 lib_reference 和来源库后，再用于放置元件。");
  output.push("");

  // Stats summary
  const totalKB = kbIndex.size;
  const totalLibs = libInventory.length;
  output.push(`> **知识库统计**: ${totalKB} 个唯一元件 | ${totalLibs} 个库 | 本次导入新增 ${addedCount} 个，更新 ${updatedCount} 个`);
  output.push("");

  // Unified index table
  output.push("## 元件统一索引（已去重）");
  output.push("");
  output.push("| lib_reference | description | footprint | designator_template | part_count | 来源库 |");
  output.push("|---|---|---|---|---|---|");

  // Sort by lib_reference for consistent lookup
  const sortedEntries = Array.from(kbIndex.values()).sort((a, b) =>
    a.lib_reference.localeCompare(b.lib_reference, undefined, { sensitivity: "base" })
  );
  for (const entry of sortedEntries) {
    const ref = entry.lib_reference.replace(/\|/g, "/");
    const desc = entry.description.replace(/\|/g, "/");
    const fp = entry.footprint.replace(/\|/g, "/");
    const designator = entry.designator_template.replace(/\|/g, "/");
    const sources = entry.sources.join("; ").replace(/\|/g, "/");
    output.push(`| ${ref} | ${desc} | ${fp} | ${designator} | ${entry.part_count} | ${sources} |`);
  }
  output.push("");

  // Library inventory
  output.push("## 库清单");
  output.push("");
  output.push("| 库名 | 路径 | 元件数 | 导入时间 |");
  output.push("|---|---|---|---|");
  for (const lib of libInventory) {
    output.push(`| ${lib.libraryName.replace(/\|/g, "/")} | ${lib.libraryPath.replace(/\|/g, "/")} | ${lib.componentCount} | ${lib.importedAt} |`);
  }
  output.push("");

  // Separator
  output.push("---");
  output.push("");

  // Per-library detail sections (for complete reference)
  output.push(`## MEM:LIB_DETAIL ${ts}`);
  output.push(`@LIB ${data.library_name} P:${data.library_path} N:${data.component_count}`);
  output.push("");
  output.push("| lib_reference | description | footprint | part_count | designator |");
  output.push("|---|---|---|---|---|");

  const sampleComponents: LibraryComponent[] = [];
  const sampleLimit = 10;
  for (const c of components) {
    const desc = (c.description || "").replace(/\|/g, "/");
    const fp = (c.footprint || "").replace(/\|/g, "/");
    const ref = (c.lib_reference || "").replace(/\|/g, "/");
    output.push(`| ${ref} | ${desc} | ${fp} | ${c.part_count} | ${c.designator_template || ""} |`);
    if (sampleComponents.length < sampleLimit) {
      sampleComponents.push(c);
    }
  }
  output.push("");

  writeFileSync(filePath, output.join("\n"), "utf8");
  return { filePath, sampleComponents };
}

/**
 * Append a compact summary block to memory/long-term/{project}.md.
 * Uses streaming lib_references from JSONL if available.
 */
function appendLongTermSummary(
  projectName: string,
  data: LibraryComponentsResult,
  jsonlFilePath?: string,
): string {
  const dir = join(memoryRootDir(), "long-term");
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${projectName}.md`);
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const header = `# Project: ${projectName}`;
  let existing = "";
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, "utf8");
  }
  const block: string[] = [];
  block.push("");
  block.push(`## 库元件知识库更新 ${ts}`);
  block.push(`- 库: ${data.library_name} (${data.component_count} 个元件)`);
  block.push(`- 路径: ${data.library_path}`);
  block.push(`- 知识库: memory/short-term/${projectName}/library-catalog.md（已去重，含来源库追踪）`);

  // Collect lib_references (from JSONL or legacy)
  const refs: string[] = [];
  if (jsonlFilePath && existsSync(jsonlFilePath)) {
    const content = readFileSync(jsonlFilePath, "utf8").trim();
    if (content) {
      const wrapped = `[${content.replace(/}\s*{/g, "},{")}]`;
      try {
        const parsed = JSON.parse(wrapped);
        if (Array.isArray(parsed)) {
          for (const c of parsed as LibraryComponent[]) {
            if (c.lib_reference) refs.push(c.lib_reference);
          }
        }
      } catch {
        // Fallback: skip
      }
    }
  } else if (data.components) {
    for (const c of data.components) {
      if (c.lib_reference) refs.push(c.lib_reference);
    }
  }

  if (refs.length > 0) {
    const chunk = 8;
    for (let i = 0; i < refs.length; i += chunk) {
      block.push(`  - ${refs.slice(i, i + chunk).join(", ")}`);
    }
  }
  block.push("");

  let content: string;
  if (existing) {
    content = existing.endsWith("\n")
      ? existing + block.join("\n")
      : existing + "\n" + block.join("\n");
  } else {
    content = header + "\n" + block.join("\n");
  }
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

registerLiveCommand(
  "get_pcb_layers",
  "List PCB layers",
  DESCRIPTION_GET_PCB_LAYERS,
  "get_pcb_layers",
  {},
  annotationsReadOnlyLive,
);

registerLiveCommand(
  "get_pcb_rules",
  "List PCB design rules",
  DESCRIPTION_GET_PCB_RULES,
  "get_pcb_rules",
  {},
  annotationsReadOnlyLive,
);

registerLiveCommand(
  "get_all_nets",
  "List PCB nets",
  DESCRIPTION_GET_ALL_NETS,
  "get_all_nets",
  {},
  annotationsReadOnlyLive,
);

registerLiveCommand(
  "get_pcb_layer_stackup",
  "PCB layer stackup",
  DESCRIPTION_GET_PCB_LAYER_STACKUP,
  "get_pcb_layer_stackup",
  {},
  annotationsReadOnlyLive,
);

server.registerTool(
  "get_all_designators",
  {
    title: "Component designators",
    description: DESCRIPTION_GET_ALL_DESIGNATORS,
    annotations: annotationsReadOnlyLive,
    inputSchema: z.object({}),
  },
  async () => {
    const r = await bridge.executeCommand("get_all_component_data", {});
    if (!r.success) {
      return jsonResult(r);
    }
    const designators = parseDesignatorsFromComponentData(r.result);
    return jsonResult(designators);
  },
);

server.registerTool(
  "get_component_pins",
  {
    title: "Component pins",
    description: DESCRIPTION_GET_COMPONENT_PINS,
    annotations: annotationsReadOnlyLive,
    inputSchema: {
      designators: z
        .array(z.string())
        .min(1)
        .describe(
          "PCB reference designators to query (must exist on the active board). Example: [\"U1\",\"Q2\",\"C10\"]",
        ),
    },
  },
  async ({ designators }) => {
    const r = await bridge.executeCommand("get_component_pins", { designators });
    return jsonResult(r);
  },
);

// ---------------------------------------------------------------------------
// PCB selection query
// ---------------------------------------------------------------------------

registerLiveCommand(
  "get_selected_components",
  "Selected component coordinates",
  DESCRIPTION_GET_SELECTED_COMPONENTS,
  "get_selected_components_coordinates",
  {},
  annotationsReadOnlyLive,
);

// ---------------------------------------------------------------------------
// PCB write operations — gated by feature flag
// ---------------------------------------------------------------------------

if (ENABLE_PCB_WRITES) {
  registerLiveCommand(
    "set_component_position",
    "Set component position",
    DESCRIPTION_SET_COMPONENT_POSITION,
    "set_component_position",
    {
      designator: z
        .string()
        .describe("PCB reference designator, e.g. \"R1\""),
      x: z
        .number()
        .describe("Target X coordinate in mils"),
      y: z
        .number()
        .describe("Target Y coordinate in mils"),
      rotation: z
        .number()
        .optional()
        .describe("Rotation in degrees. Omit or -1 to keep current rotation"),
    },
    annotationsPcbWrite,
  );

  registerLiveCommand(
    "move_components",
    "Move components by offset",
    DESCRIPTION_MOVE_COMPONENTS,
    "move_components",
    {
      designators: z
        .array(z.string())
        .min(1)
        .describe("PCB reference designators to move, e.g. [\"R1\",\"R2\"]"),
      x_offset: z
        .number()
        .describe("X offset in mils"),
      y_offset: z
        .number()
        .describe("Y offset in mils"),
      rotation: z
        .number()
        .optional()
        .describe("Rotation in degrees. Default 0 (no change)"),
    },
    annotationsPcbWrite,
  );

  registerLiveCommand(
    "create_net_class",
    "Create PCB net class",
    DESCRIPTION_CREATE_NET_CLASS,
    "create_net_class",
    {
      class_name: z
        .string()
        .describe("Name for the net class, e.g. \"POWER_NETS\""),
      net_names: z
        .array(z.string())
        .min(1)
        .describe("Net names to add, e.g. [\"VCC\",\"GND\"]"),
    },
    annotationsPcbWrite,
  );

  registerLiveCommand(
    "set_pcb_layer_visibility",
    "Toggle PCB layer visibility",
    DESCRIPTION_SET_PCB_LAYER_VISIBILITY,
    "set_pcb_layer_visibility",
    {
      layer_names: z
        .array(z.string())
        .min(1)
        .describe("Layer display names, e.g. [\"Top Overlay\",\"Bottom Overlay\"]"),
      visible: z
        .boolean()
        .describe("true to show, false to hide"),
    },
    annotationsPcbWrite,
  );
}

// ---------------------------------------------------------------------------
// Layout duplication
// ---------------------------------------------------------------------------

registerLiveCommand(
  "layout_duplicator",
  "Discover layout duplication groups",
  DESCRIPTION_LAYOUT_DUPLICATOR,
  "layout_duplicator",
  {},
  annotationsReadOnlyLive,
);

if (ENABLE_PCB_WRITES) {
  registerLiveCommand(
    "layout_duplicator_apply",
    "Apply layout duplication",
    DESCRIPTION_LAYOUT_DUPLICATOR_APPLY,
    "layout_duplicator_apply",
    {
      source_designators: z
        .array(z.string())
        .min(1)
        .describe("Source designators whose layout to copy, e.g. [\"R1\"]"),
      destination_designators: z
        .array(z.string())
        .min(1)
        .describe("Destination designators to receive the layout, e.g. [\"R2\",\"R3\"]"),
    },
    annotationsPcbWrite,
  );
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

registerLiveCommand(
  "take_view_screenshot",
  "Capture view screenshot",
  DESCRIPTION_TAKE_VIEW_SCREENSHOT,
  "take_view_screenshot",
  {
    view_type: z
      .enum(["pcb", "sch"])
      .optional()
      .describe("\"pcb\" or \"sch\". Defaults to \"pcb\""),
  },
  annotationsReadOnlyLive,
);

// ---------------------------------------------------------------------------
// Library operations
// ---------------------------------------------------------------------------

server.registerTool(
  "get_library_symbol_reference",
  {
    title: "Library symbol references",
    description: DESCRIPTION_GET_LIBRARY_SYMBOL_REFERENCE,
    annotations: annotationsReadOnlyLive,
    inputSchema: {
      library_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to a .SchLib file. If omitted, searches all .SchLib files in the focused project, then falls back to memory cache.",
        ),
    },
  },
  async ({ library_path }) => {
    // 1. Try Altium bridge first (real-time data with pin info)
    const r = await bridge.executeCommand("get_library_symbol_reference", {
      ...(library_path ? { library_path } : {}),
    });

    // 2. If bridge returned components, return them
    if (r.success && r.result) {
      const data = r.result as { component_count?: number };
      if (data.component_count && data.component_count > 0) {
        return jsonResult(r);
      }
    }

    // 3. Bridge returned 0 components — fall back to memory cache
    const allCatalogs = memoryMgr.listCatalogs();
    if (allCatalogs.length === 0) {
      // No cache available either
      return jsonResult(r);
    }

    // 4. Build response from memory cache
    const cachedComponents: Array<{
      lib_reference: string;
      description: string;
      designator: string;
      part_count: number;
      library_name: string;
      library_path: string;
      project_name: string;
      footprint: string;
      cached: boolean;
    }> = [];

    for (const catalog of allCatalogs) {
      for (const lib of catalog.libraries) {
        // Filter by library_path if specified
        if (library_path && lib.libraryPath.toLowerCase() !== library_path.toLowerCase()) {
          continue;
        }
        const fullCatalog = memoryMgr.getCatalog(catalog.projectName);
        if (!fullCatalog) continue;
        const libEntry = fullCatalog.libraries.find(
          (l) => l.libraryPath.toLowerCase() === lib.libraryPath.toLowerCase(),
        );
        if (!libEntry) continue;
        for (const comp of libEntry.components) {
          cachedComponents.push({
            lib_reference: comp.lib_reference,
            description: comp.description,
            designator: comp.designator_template,
            part_count: comp.part_count,
            library_name: comp.libraryName,
            library_path: comp.libraryPath,
            project_name: comp.projectName,
            footprint: comp.footprint,
            cached: true,
          });
        }
      }
    }

    if (cachedComponents.length > 0) {
      return jsonResult({
        success: true,
        component_count: cachedComponents.length,
        components: cachedComponents,
        source: "memory_cache",
        message: `Retrieved ${cachedComponents.length} component(s) from memory cache (Altium bridge returned 0). Pin details not available in cached mode.`,
      });
    }

    // 5. No cache match either — return original bridge result
    return jsonResult(r);
  },
);

// search_library_symbol: check memory cache first, fall back to Altium bridge
server.registerTool(
  "search_library_symbol",
  {
    title: "Search library symbols",
    description: DESCRIPTION_SEARCH_LIBRARY_SYMBOL,
    annotations: annotationsReadOnlyLive,
    inputSchema: {
      symbol_name: z
        .string()
        .describe("Symbol name or partial name to search for, e.g. \"Resistor\""),
      library_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to a .SchLib file. If omitted: (1) searches all .SchLib files in the focused project automatically, (2) if no project is focused, checks if a .SchLib is already open. Does NOT show a file dialog.",
        ),
    },
  },
  async ({ symbol_name, library_path }) => {
    // 1. Check memory cache first (only when no specific library_path is given)
    if (!library_path) {
      const cached = memoryMgr.searchBySymbol(symbol_name);
      if (cached.found) {
        // Return with library-level distinction
        const matches = cached.matches.map((c) => ({
          name: c.lib_reference,
          description: c.description,
          footprint: c.footprint,
          library_name: c.libraryName,
          library_path: c.libraryPath,
          project_name: c.projectName,
          cached: true,
        }));
        return jsonResult({
          found: true,
          match_count: matches.length,
          matches,
          cache_hit: true,
          total_cached_symbols: cached.total_cached,
          message: `Found ${matches.length} match(es) in memory cache across ${new Set(matches.map(m => m.library_name)).size} library/libraries.`,
        });
      }
      // If cache has components but no match, still try bridge
      if (!memoryMgr.isEmpty()) {
        // Cache exists but no match - try bridge for completeness
      }
    } else {
      // Specific library_path given: check if this library is cached
      const cached = memoryMgr.searchBySymbol(symbol_name);
      if (cached.found) {
        const filtered = cached.matches.filter(
          (c) => c.libraryPath.toLowerCase() === library_path.toLowerCase(),
        );
        if (filtered.length > 0) {
          const matches = filtered.map((c) => ({
            name: c.lib_reference,
            description: c.description,
            footprint: c.footprint,
            library_name: c.libraryName,
            library_path: c.libraryPath,
            project_name: c.projectName,
            cached: true,
          }));
          return jsonResult({
            found: true,
            match_count: matches.length,
            matches,
            cache_hit: true,
            total_cached_symbols: cached.total_cached,
            message: `Found ${matches.length} match(es) in cached library ${filtered[0].libraryName}.`,
          });
        }
      }
    }

    // 2. Fall back to Altium bridge
    const r = await bridge.executeCommand("search_library_symbol", {
      symbol_name,
      ...(library_path ? { library_path } : {}),
    });
    return jsonResult(r);
  },
);

server.registerTool(
  "import_library_components",
  {
    title: "Import library components to memory",
    description: DESCRIPTION_IMPORT_LIBRARY_COMPONENTS,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: {
      library_path: z
        .string()
        .describe(
          "Absolute path to a project-directory .SchLib file to enumerate and cache into memory",
        ),
    },
  },
  async ({ library_path: libraryPath }) => {
    const r = await bridge.executeCommand("list_library_components", {
      library_path: libraryPath,
    });
    if (!r.success) {
      return jsonResult(r);
    }
    const data = r.result as LibraryComponentsResult;
    const projectName = resolveProjectName(data.project_path, data.library_path);
    const jsonlFile = data.jsonl_file || "";

    // Stream-write catalog using JSONL (no large array in memory)
    const { filePath: shortTermPath, sampleComponents } = writeShortTermCatalog(
      projectName,
      data,
      jsonlFile,
    );
    const longTermPath = appendLongTermSummary(projectName, data, jsonlFile);

    // Auto-refresh the in-memory cache
    const refreshedCount = memoryMgr.loadAll();

    return jsonResult({
      success: true,
      library_name: data.library_name,
      library_path: data.library_path,
      component_count: data.component_count,
      project_name: projectName,
      jsonl_file: jsonlFile || undefined,
      memory_files: { short_term: shortTermPath, long_term: longTermPath },
      cache_refreshed: true,
      cached_catalogs: refreshedCount,
      knowledge_base: {
        total_unique_components: memoryMgr.getTotalComponents(),
        total_raw_entries: memoryMgr.getTotalRawEntries(),
      },
      sample_components: sampleComponents.map((c) => ({
        lib_reference: c.lib_reference,
        description: c.description,
        footprint: c.footprint,
      })),
    });
  },
);

// ---------------------------------------------------------------------------
// Memory cache management tools
// ---------------------------------------------------------------------------

server.registerTool(
  "refresh_memory_cache",
  {
    title: "Refresh memory cache",
    description: `Purpose: Reload all library catalogs from memory/short-term/*/ into the in-memory cache. Use after manually editing catalog files or when cache is stale.
Parameters: None.
Returns: { success, catalogs_loaded, total_unique_components, total_raw_entries, catalogs: [{ project_name, kb_stats?, libraries: [...] }] }.`,
    annotations: annotationsNodeOnly,
    inputSchema: z.object({}),
  },
  () => {
    const count = memoryMgr.loadAll();
    const catalogs = memoryMgr.listCatalogs();
    return jsonResult({
      success: true,
      catalogs_loaded: count,
      total_unique_components: memoryMgr.getTotalComponents(),
      total_raw_entries: memoryMgr.getTotalRawEntries(),
      deduplication_ratio: memoryMgr.getTotalRawEntries() > 0
        ? `${((1 - memoryMgr.getTotalComponents() / memoryMgr.getTotalRawEntries()) * 100).toFixed(1)}%`
        : "0%",
      catalogs: catalogs.map((c) => ({
        project_name: c.projectName,
        kb_stats: c.kbStats,
        libraries: c.libraries.map((lib) => ({
          library_name: lib.libraryName,
          library_path: lib.libraryPath,
          component_count: lib.componentCount,
          loaded_at: lib.loadedAt,
        })),
      })),
    });
  },
);

server.registerTool(
  "get_memory_status",
  {
    title: "Get memory cache status",
    description: `Purpose: Check the current state of the library knowledge base cache.
Parameters: None.
Returns: { catalogs_loaded, total_unique_components, total_raw_entries, deduplication_ratio, is_empty, catalogs: [...] }.`,
    annotations: annotationsNodeOnly,
    inputSchema: z.object({}),
  },
  () => {
    const catalogs = memoryMgr.listCatalogs();
    const totalUnique = memoryMgr.getTotalComponents();
    const totalRaw = memoryMgr.getTotalRawEntries();
    return jsonResult({
      catalogs_loaded: catalogs.length,
      total_unique_components: totalUnique,
      total_raw_entries: totalRaw,
      deduplication_ratio: totalRaw > 0
        ? `${((1 - totalUnique / totalRaw) * 100).toFixed(1)}%`
        : "0%",
      is_empty: memoryMgr.isEmpty(),
      catalogs: catalogs.map((c) => ({
        project_name: c.projectName,
        kb_stats: c.kbStats,
        libraries: c.libraries.map((lib) => ({
          library_name: lib.libraryName,
          library_path: lib.libraryPath,
          component_count: lib.componentCount,
          loaded_at: lib.loadedAt,
        })),
      })),
    });
  },
);

if (ENABLE_SYMBOL_CREATION) {
  registerLiveCommand(
    "create_schematic_symbol",
    "Create schematic symbol",
    DESCRIPTION_CREATE_SCHEMATIC_SYMBOL,
    "create_schematic_symbol",
    {
      symbol_name: z
        .string()
        .describe("Name for the new symbol, e.g. \"CUSTOM_OPAMP\""),
      part_count: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Number of parts for multi-part symbols. Default 1"),
      pins: z
        .array(z.string())
        .min(1)
        .describe("Pin definitions: \"number,name,electrical_type\" (I/O/B/P). Example: [\"1,IN+,I\",\"2,OUT,O\"]"),
      description: z
        .string()
        .optional()
        .describe("Human-readable description for the symbol"),
    },
    annotationsPcbWrite,
  );
}

// ---------------------------------------------------------------------------
// Output jobs
// ---------------------------------------------------------------------------

registerLiveCommand(
  "get_output_job_containers",
  "List output job containers",
  DESCRIPTION_GET_OUTPUT_JOB_CONTAINERS,
  "get_output_job_containers",
  {},
  annotationsReadOnlyLive,
);

registerLiveCommand(
  "run_output_jobs",
  "Run output jobs",
  DESCRIPTION_RUN_OUTPUT_JOBS,
  "run_output_jobs",
  {
    container_names: z
      .array(z.string())
      .min(1)
      .describe("Output container names to run, e.g. [\"Gerber Files\",\"BOM\"]"),
  },
  annotationsOutputGenerate,
);

// PCB edit primitives — action-based single tool
if (ENABLE_PCB_WRITES) {
  registerLiveCommand(
    "pcb_edit",
    "Edit PCB primitives",
    DESCRIPTION_PCB_EDIT,
    "pcb_edit",
    {
      action: z
        .string()
        .describe("add_track | add_pad | add_via | add_fill | add_arc | add_text | delete_objects | select_objects | add_region | add_polygon_pour | modify_track | modify_pad | modify_via | modify_text | move_to_layer | assign_net | rebuild_polygons"),
      x1_mils: z.number().optional().describe("X1 coordinate in mils (add_track, add_fill)"),
      y1_mils: z.number().optional().describe("Y1 coordinate in mils (add_track, add_fill)"),
      x2_mils: z.number().optional().describe("X2 coordinate in mils (add_track, add_fill)"),
      y2_mils: z.number().optional().describe("Y2 coordinate in mils (add_track, add_fill)"),
      x_mils: z.number().optional().describe("X coordinate in mils (add_pad, add_via, add_text)"),
      y_mils: z.number().optional().describe("Y coordinate in mils (add_pad, add_via, add_text)"),
      width_mils: z.number().optional().describe("Width in mils (add_track default 10, add_pad default 60, modify_track)"),
      height_mils: z.number().optional().describe("Height in mils (add_pad default=width, modify_pad)"),
      hole_size_mils: z.number().optional().describe("Hole size in mils (add_pad default 0, add_via default 20, modify_pad, modify_via)"),
      size_mils: z.number().optional().describe("Via size in mils (add_via default 50, modify_via)"),
      radius_mils: z.number().optional().describe("Arc radius in mils (add_arc)"),
      x_center_mils: z.number().optional().describe("Arc center X in mils (add_arc)"),
      y_center_mils: z.number().optional().describe("Arc center Y in mils (add_arc)"),
      start_angle: z.number().optional().describe("Arc start angle in degrees (add_arc default 0)"),
      end_angle: z.number().optional().describe("Arc end angle in degrees (add_arc default 360)"),
      rotation: z.number().optional().describe("Rotation in degrees (add_fill default 0, add_text default 0, modify_text)"),
      text: z.string().optional().describe("Text string (add_text, modify_text)"),
      layer: z.string().optional().describe("Layer name (top|bottom|top_overlay|bottom_overlay|keepout|multi|mechanical1-16 etc.)"),
      net_name: z.string().optional().describe("Net name (add_via, add_region, add_polygon_pour, assign_net, modify_track, modify_via)"),
      name: z.string().optional().describe("Pad name (add_pad)"),
      object_type: z.string().optional().describe("Object type for delete/select/move_to_layer/assign_net (track|pad|via|fill|arc|text|component|all)"),
      select: z.boolean().optional().describe("true=select, false=deselect (select_objects default true)"),
      selected_only: z.boolean().optional().describe("For modify_track/pad/via/text: true=modify only selected objects (default true), false=modify all matching objects"),
      points_csv: z.string().optional().describe("Comma-separated x,y pairs for add_region and add_polygon_pour (e.g. '0,0,100,0,100,100,0,100')"),
      grid_mils: z.number().optional().describe("Polygon pour grid in mils (add_polygon_pour default 10)"),
      track_size_mils: z.number().optional().describe("Polygon pour track size in mils (add_polygon_pour default 8)"),
      min_track_mils: z.number().optional().describe("Polygon pour min track width in mils (add_polygon_pour default 4)"),
      hatch_style: z.number().optional().describe("Polygon hatch style 0-5 (add_polygon_pour default 5=solid)"),
      pour_over: z.boolean().optional().describe("Polygon pour over same net (add_polygon_pour default true)"),
      target_layer: z.string().optional().describe("Target layer for move_to_layer (top|bottom|top_overlay|etc.)"),
    },
    annotationsPcbWrite,
  );
}

registerLiveCommand(
  "compile_project",
  "Compile project",
  DESCRIPTION_COMPILE_PROJECT,
  "compile_project",
  {},
  annotationsReadOnlyLive,
);

registerLiveCommand(
  "open_document",
  "Open document",
  DESCRIPTION_OPEN_DOCUMENT,
  "open_document",
  {
    document_kind: z
      .string()
      .describe("SCH | PCB | PCBLIB | TEXT | PRJPCB"),
    file_path: z
      .string()
      .describe("Absolute path to the document file"),
  },
  annotationsReadOnlyLive,
);

registerLiveCommand(
  "zoom_view",
  "Zoom view",
  DESCRIPTION_ZOOM_VIEW,
  "zoom_view",
  {
    zoom_action: z
      .string()
      .optional()
      .describe("all | fit | redraw | refresh | in | out (default: redraw)"),
  },
  annotationsReadOnlyLive,
);

// PCB component manipulation — action-based single tool
if (ENABLE_PCB_WRITES) {
  registerLiveCommand(
    "pcb_component",
    "Manipulate PCB component",
    DESCRIPTION_PCB_COMPONENT,
    "pcb_component",
    {
      action: z
        .string()
        .describe("rotate | flip | select | get_properties | set_height | set_moveable | set_name_visibility | set_comment_visibility | set_autoposition | get_3d_bodies | set_lock_strings"),
      designator: z
        .string()
        .describe("Component reference designator (e.g. U1, R3)"),
      rotation: z
        .number()
        .optional()
        .describe("Absolute rotation angle in degrees 0-360 (required for rotate action)"),
      select: z
        .boolean()
        .optional()
        .describe("true=select, false=deselect (default true, for select action)"),
      height_mils: z
        .number()
        .optional()
        .describe("Component height in mils (required for set_height action)"),
      moveable: z
        .boolean()
        .optional()
        .describe("true=unlock, false=lock (required for set_moveable action)"),
      visible: z
        .boolean()
        .optional()
        .describe("true=show, false=hide (required for set_name_visibility and set_comment_visibility actions)"),
      name_autoposition: z
        .number()
        .optional()
        .describe("Name autoposition 0-9 (for set_autoposition: 0=CenterLeft,1=CenterRight,2=TopLeft,3=BottomLeft,4=TopRight,5=BottomRight,6=CenterAbove,7=CenterBelow,8=CenterCenter,9=Manual)"),
      comment_autoposition: z
        .number()
        .optional()
        .describe("Comment autoposition 0-9 (for set_autoposition: same values as name_autoposition)"),
      lock_strings: z
        .boolean()
        .optional()
        .describe("true=lock, false=unlock string primitives (required for set_lock_strings action)"),
    },
    annotationsPcbWrite,
  );
}

// PCB DRC violations — read-only query
registerLiveCommand(
  "pcb_drc",
  "List DRC violations",
  DESCRIPTION_PCB_DRC,
  "pcb_drc",
  {},
  annotationsReadOnlyLive,
);

// PCB board info — dimensions and outline
registerLiveCommand(
  "pcb_board_info",
  "Get board info",
  DESCRIPTION_PCB_BOARD_INFO,
  "pcb_board_info",
  {},
  annotationsReadOnlyLive,
);

// PCB polygon info — list all polygon pours
registerLiveCommand(
  "pcb_polygon_info",
  "List polygon pours",
  DESCRIPTION_PCB_POLYGON_INFO,
  "pcb_polygon_info",
  {},
  annotationsReadOnlyLive,
);

// PCB net info — detailed net info + select net
registerLiveCommand(
  "pcb_net_info",
  "Get net info / select net",
  DESCRIPTION_PCB_NET_INFO,
  "pcb_net_info",
  {
    net_name: z
      .string()
      .describe("Net name (e.g. GND, VCC, D0)"),
    action: z
      .string()
      .optional()
      .describe("info (default) | select"),
    select: z
      .boolean()
      .optional()
      .describe("When action=select: true=select (default), false=deselect"),
  },
  annotationsReadOnlyLive,
);

// Overlap report — scan board for overlaps and out-of-board components
registerLiveCommand(
  "overlap_report",
  "Report component overlaps and out-of-board placements",
  DESCRIPTION_OVERLAP_REPORT,
  "overlap_report",
  {},
  annotationsReadOnlyLive,
);

// Generate project report (netlist, BOM, etc.)
registerLiveCommand(
  "generate_report",
  "Generate project report",
  DESCRIPTION_GENERATE_REPORT,
  "generate_report",
  {
    report_type: z
      .string()
      .optional()
      .describe("netlist (default) | bom | component_cross_reference | project_statuses | report_project"),
  },
  annotationsOutputGenerate,
);

// ---------------------------------------------------------------------------
// Knowledge base vector search
// ---------------------------------------------------------------------------

const KB_INDEX_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "knowledge-base",
  "kb-index.json",
);

server.registerTool(
  "search_knowledge_base",
  {
    title: "Search knowledge base",
    description: `Purpose: Search the circuit design knowledge base using TF-IDF vector similarity. Returns relevant chunks from schematic-design, classic-circuits, design-rules, component-selection, drc-templates, power-supply and other categories.
Parameters:
- query (string, required): Natural language search query, e.g. "LDO design capacitor selection" or "pre-draw layout planning"
- category (string, optional): Filter by category: schematic-design | classic-circuits | design-rules | component-selection | drc-templates | power-supply | gjb5000b
- limit (number, optional): Max results, default 5
Returns: { results: [{ id, file, category, title, content, keywords, score, matchedTerms }], totalResults }.
Usage: MANDATORY BEFORE DRAWING — search category "schematic-design" (01-pre-draw-layout-planning is the entry point) to form a layout plan BEFORE placing components; also call when making any design decision (topology, component selection, layout patterns).`,
    annotations: annotationsNodeOnly,
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Natural language search query, e.g. 'LDO design' or 'differential pair impedance'"),
      category: z
        .string()
        .optional()
        .describe("Filter: schematic-design | classic-circuits | design-rules | component-selection | drc-templates | power-supply | gjb5000b"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Max results (default 5)"),
    },
  },
  async ({ query, category, limit }) => {
    if (!existsSync(KB_INDEX_PATH)) {
      return errResult(
        `Knowledge base index not found. Run "npm run build-kb" first.`,
      );
    }
    try {
      const results = searchKnowledgeBase(query, {
        category: category || undefined,
        limit: limit || 5,
      });
      return jsonResult({
        success: true,
        query,
        category: category || "all",
        totalResults: results.length,
        results,
      });
    } catch (e) {
      return errResult(`Knowledge base search error: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "get_knowledge_base_stats",
  {
    title: "Knowledge base statistics",
    description: `Purpose: Get knowledge base index statistics (total chunks, files, categories, vocabulary size). Use to verify the index is built and available.
Parameters: None.
Returns: { success, indexExists, totalChunks, totalFiles, categories, vocabularySize }.`,
    annotations: annotationsNodeOnly,
    inputSchema: z.object({}),
  },
  async () => {
    if (!existsSync(KB_INDEX_PATH)) {
      return jsonResult({
        success: true,
        indexExists: false,
        message: 'Index not built. Run "npm run build-kb" to generate.',
      });
    }
    try {
      const stats = getKnowledgeBaseStats();
      const cats = listKnowledgeBaseCategories();
      return jsonResult({
        success: true,
        indexExists: true,
        ...stats,
        categories: cats,
      });
    } catch (e) {
      return errResult(`Failed to read knowledge base stats: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "file_mode_capabilities",
  {
    title: "File-mode capabilities",
    description: DESCRIPTION_FILE_MODE_CAPABILITIES,
    annotations: annotationsNodeOnly,
    inputSchema: z.object({}),
  },
  async () => jsonResult(getFileModeCapabilities()),
);

async function main(): Promise<void> {
  bridge.ensureLayout();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
