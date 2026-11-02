import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import { discoverAltiumExe } from "../altiumPaths.js";
import {
  BRIDGE_PROTOCOL_VERSION,
  loadUserConfig,
  resolveAltiumExe,
  resolveWorkspaceRoot,
  saveUserConfig,
  type UserConfig,
} from "../config.js";
import { ensureAltiumScriptBundle, scriptProjectPath } from "../workspaceLayout.js";
import { withBridgeLock } from "./lock.js";

const BridgeResponseSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  requestId: z.number().optional(),
});

/**
 * Read ONE snapshot of response.json without ever failing:
 * - ok:        valid bridge response (success or failure payload)
 * - not-ready: file missing / half-written (JSON parse failed) / shape-invalid
 *              — all are poll-again states; a complete-but-invalid file cannot
 *              recover, so the caller remembers the reason for the verdict.
 * - stale:     shape-valid but requestId mismatches the request we sent (T4).
 */
export type ResponseSnapshot =
  | { state: "ok"; response: BridgeResponse }
  | { state: "not-ready"; kind: "no-file" | "parse" | "schema" }
  | { state: "stale" };

export function readBridgeResponseSnapshot(
  responsePath: string,
  expectedRequestId?: number,
): ResponseSnapshot {
  if (!existsSync(responsePath)) return { state: "not-ready", kind: "no-file" };
  let parsed: unknown;
  try {
    // Strip a leading BOM before JSON.parse — Node's JSON.parse rejects it and
    // some Pascal-side writers may emit one.
    const raw = readFileSync(responsePath, "utf8").replace(/^\uFEFF/, "");
    parsed = JSON.parse(raw) as unknown;
  } catch {
    // Half-written or concurrently-truncated file — keep polling.
    return { state: "not-ready", kind: "parse" };
  }
  const res = BridgeResponseSchema.safeParse(parsed);
  if (!res.success) {
    // Valid JSON but not a bridge response — could still be a half-write that
    // happens to parse; poll until deadline rather than failing immediately.
    return { state: "not-ready", kind: "schema" };
  }
  // T4: if the request carried a requestId, only accept the matching response.
  if (expectedRequestId !== undefined && res.data.requestId !== expectedRequestId) {
    return { state: "stale" };
  }
  return { state: "ok", response: res.data };
}

/** Written by Altium_API.pas WriteResponse on failure (workspace root). */
export const BRIDGE_LAST_ERROR_FILENAME = "bridge_last_error.txt";

/** User pastes Altium Script compile / Messages text here for MCP diagnostics. */
export const BRIDGE_USER_REPORTED_ERROR_FILENAME = "bridge_user_reported_error.txt";

export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;

function readWorkspaceTextSnippet(
  workspaceRoot: string,
  fileName: string,
  maxChars: number,
): string | null {
  const p = join(workspaceRoot, fileName);
  if (!existsSync(p)) return null;
  try {
    // Strip a leading BOM — Pascal now writes UTF-8 (T5) which may carry one.
    const s = readFileSync(p, "utf8").replace(/^\uFEFF/, "").trim();
    if (!s) return null;
    return s.length > maxChars ? `${s.slice(0, maxChars)}\n...(truncated)` : s;
  } catch {
    return null;
  }
}

/** Merge Altium-written bridge_last_error.txt into the MCP error string for agents. */
function augmentBridgeFailure(workspaceRoot: string, res: BridgeResponse): BridgeResponse {
  if (res.success) return res;
  const extra = readWorkspaceTextSnippet(workspaceRoot, BRIDGE_LAST_ERROR_FILENAME, 12_000);
  if (!extra) return res;
  const merged = res.error
    ? `${res.error}\n--- ${BRIDGE_LAST_ERROR_FILENAME} ---\n${extra}`
    : extra;
  return { ...res, error: merged };
}

export function readBridgeDiagnosticSnippets(workspaceRoot: string): {
  bridgeLastError: string | null;
  bridgeUserReportedError: string | null;
} {
  return {
    bridgeLastError: readWorkspaceTextSnippet(
      workspaceRoot,
      BRIDGE_LAST_ERROR_FILENAME,
      12_000,
    ),
    bridgeUserReportedError: readWorkspaceTextSnippet(
      workspaceRoot,
      BRIDGE_USER_REPORTED_ERROR_FILENAME,
      12_000,
    ),
  };
}

export interface AltiumBridgeOptions {
  bundledScriptsDir: string;
  timeoutMs?: number;
}

export function defaultBundledScriptsDir(): string {
  /* dist/bridge/altiumBridge.js -> ../../altium-scripts */
  const u = new URL("../../altium-scripts", import.meta.url);
  if (u.protocol === "file:") {
    return fileURLToPath(u);
  }
  return join(process.cwd(), "altium-scripts");
}

export class AltiumBridge {
  private readonly bundledScriptsDir: string;
  private readonly timeoutMs: number;
  /** Monotonic request correlation id (T4: echoed back by Altium_API.pas). */
  private requestSeq = 0;

  constructor(options: AltiumBridgeOptions) {
    this.bundledScriptsDir = options.bundledScriptsDir;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  get workspaceRoot(): string {
    return resolveWorkspaceRoot(loadUserConfig());
  }

  getRequestPath(): string {
    return join(this.workspaceRoot, "request.json");
  }

  getResponsePath(): string {
    return join(this.workspaceRoot, "response.json");
  }

  getScriptProjectPath(): string {
    return scriptProjectPath(this.workspaceRoot);
  }

  resolveAltiumExePath(): string | undefined {
    const cfg = loadUserConfig();
    return resolveAltiumExe(cfg) ?? discoverAltiumExe();
  }

  persistAltiumExePath(exe: string): void {
    const cfg = loadUserConfig();
    saveUserConfig({ ...cfg, altiumExePath: exe });
  }

  ensureLayout(options?: { force?: boolean }): void {
    ensureAltiumScriptBundle(this.workspaceRoot, this.bundledScriptsDir, options);
  }

  /**
   * Writes request.json, launches X2.EXE with ScriptingSystem:RunScript, waits for response.json.
   * @param options.timeoutMs — Override default wait (e.g. longer for schematic_edit when Altium is slow).
   */
  async executeCommand(
    command: string,
    params: Record<string, unknown> = {},
    options?: { timeoutMs?: number },
  ): Promise<BridgeResponse> {
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    return withBridgeLock(this.workspaceRoot, async () => {
      const forceBundle =
        process.env.ALTIUM_MCP_FORCE_BUNDLE_SYNC === "1" ||
        process.env.ALTIUM_MCP_FORCE_BUNDLE_SYNC === "true";
      this.ensureLayout(forceBundle ? { force: true } : undefined);
      const exe = this.resolveAltiumExePath();
      const scriptPrj = this.getScriptProjectPath();

      if (!exe || !existsSync(exe)) {
        return {
          success: false,
          error: "AD_NOT_FOUND",
        };
      }
      if (!existsSync(scriptPrj)) {
        return {
          success: false,
          error: "SCRIPT_PROJECT_NOT_FOUND",
        };
      }

      const requestPath = this.getRequestPath();
      const responsePath = this.getResponsePath();

      try {
        if (existsSync(responsePath)) unlinkSync(responsePath);
      } catch {
        /* ignore */
      }

      const requestId = ++this.requestSeq;
      const body = {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        command,
        ...params,
        requestId,
      };
      writeFileSync(requestPath, JSON.stringify(body, null, 2), "utf8");

      const launched = await launchAltiumRunScript(exe, scriptPrj);
      if (!launched) {
        return { success: false, error: "ALT_LAUNCH_FAILED" };
      }

      // Poll until deadline; missing/half-written/mismatched snapshots are
      // "not ready" — only a VALID matching response terminates early.
      const deadline = Date.now() + timeoutMs;
      let sawFile = false;
      let sawSchemaInvalid = false;
      let sawStale = false;
      while (Date.now() < deadline) {
        const snap = readBridgeResponseSnapshot(responsePath, requestId);
        if (snap.state === "ok") {
          return snap.response.success
            ? snap.response
            : augmentBridgeFailure(this.workspaceRoot, snap.response);
        }
        if (snap.state === "not-ready") {
          if (snap.kind !== "no-file") sawFile = true;
          if (snap.kind === "schema") sawSchemaInvalid = true;
        } else {
          // shape-valid but from another request epoch — wait for ours
          sawFile = true;
          sawStale = true;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (sawStale) {
        return {
          success: false,
          error: "STALE_RESPONSE (a response.json from another request kept reappearing — check for concurrent Altium script runs)",
        };
      }
      if (sawSchemaInvalid) return { success: false, error: "INVALID_BRIDGE_RESPONSE" };
      if (sawFile) return { success: false, error: "RESPONSE_READ_FAILED" };
      return { success: false, error: "TIMEOUT" };
    });
  }
}

/**
 * Verdict logic for one launched process (see launchAltiumRunScript).
 * Exported for tests.
 */
export function observeLaunchProcess(child: ChildProcess, observeMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    child.once("error", () => settle(false));
    child.once("exit", (code) => {
      if (settled) return;
      settle(code === 0);
    });
    const timer = setTimeout(() => settle(true), observeMs);
    timer.unref();
  });
}

/**
 * Windows cmd: pipe must be escaped as ^| for -RScriptingSystem:RunScript(...)
 *
 * Launch verdict within a short observe window:
 * - spawn `error` event            -> false (real spawn failure)
 * - quick exit with non-zero code  -> false (exe path/args rejected by cmd —
 *                                    previously this surfaced as a 120s TIMEOUT)
 * - quick exit with code 0         -> true  (forwarder handing off to an
 *                                    already-running Altium instance)
 * - still running at window end    -> true  (Altium launching normally)
 */
export async function launchAltiumRunScript(
  altiumExe: string,
  scriptPrjPath: string,
  options: { observeMs?: number } = {},
): Promise<boolean> {
  const projectArg = scriptPrjPath.replace(/\//g, "\\");
  const inner = `ProjectName="${projectArg}"^|ProcName="Altium_API>Run"`;
  const cmd = `"${altiumExe}" -RScriptingSystem:RunScript(${inner})`;
  const observeMs = options.observeMs ?? 3_000;

  const child = spawn(cmd, {
    shell: true,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  if (child.pid === undefined) return false;
  return observeLaunchProcess(child, observeMs);
}
