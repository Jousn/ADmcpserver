import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const BRIDGE_PROTOCOL_VERSION = 1;

export interface UserConfig {
  altiumExePath?: string;
  workspaceRoot?: string;
}

const configDir = join(homedir(), ".altium-mcp");
const configPath = join(configDir, "config.json");

export function defaultWorkspaceRoot(): string {
  return join(configDir, "workspace");
}

export function loadUserConfig(): UserConfig {
  try {
    if (!existsSync(configPath)) {
      return {};
    }
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw) as UserConfig;
  } catch {
    return {};
  }
}

export function saveUserConfig(cfg: UserConfig): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf8");
}

export function resolveWorkspaceRoot(cfg: UserConfig): string {
  const env = process.env.ALTIUM_MCP_WORKSPACE?.trim();
  if (env) return env;
  if (cfg.workspaceRoot?.trim()) return cfg.workspaceRoot.trim();
  return defaultWorkspaceRoot();
}

export function resolveAltiumExe(cfg: UserConfig): string | undefined {
  const env = process.env.ALTIUM_MCP_ALTIUM_EXE?.trim();
  if (env) return env;
  if (cfg.altiumExePath?.trim()) return cfg.altiumExePath.trim();
  return undefined;
}
