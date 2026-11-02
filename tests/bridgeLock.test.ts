import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LockTimeoutError, withBridgeLock } from "../src/bridge/lock.js";

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "altium-mcp-lock-"));
}

function lockPath(ws: string): string {
  return join(ws, ".bridge.lock");
}

describe("withBridgeLock", () => {
  it("returns fn result and releases the lock", async () => {
    const ws = tempWorkspace();
    try {
      const r = await withBridgeLock(ws, async () => 42);
      expect(r).toBe(42);
      expect(existsSync(lockPath(ws))).toBe(false);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("propagates business errors ONCE — fn is never re-executed", async () => {
    const ws = tempWorkspace();
    try {
      let calls = 0;
      await expect(
        withBridgeLock(ws, async () => {
          calls++;
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(calls).toBe(1);
      expect(existsSync(lockPath(ws))).toBe(false);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("removes a stale lock (dead pid) and acquires", async () => {
    const ws = tempWorkspace();
    try {
      writeFileSync(lockPath(ws), "999999999", "utf8");
      const r = await withBridgeLock(ws, async () => "ok", { waitMs: 2000, pollMs: 20 });
      expect(r).toBe("ok");
      expect(existsSync(lockPath(ws))).toBe(false);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("times out while a live lock (existing pid) is held", async () => {
    const ws = tempWorkspace();
    try {
      // Our own pid is alive, so stale detection must NOT remove this lock.
      writeFileSync(lockPath(ws), String(process.pid), "utf8");
      await expect(
        withBridgeLock(ws, async () => 1, { waitMs: 300, pollMs: 20 }),
      ).rejects.toBeInstanceOf(LockTimeoutError);
      expect(existsSync(lockPath(ws))).toBe(true);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("serializes concurrent callers", async () => {
    const ws = tempWorkspace();
    try {
      let inside = 0;
      let maxConcurrent = 0;
      await Promise.all(
        Array.from({ length: 5 }, () =>
          withBridgeLock(
            ws,
            async () => {
              inside++;
              maxConcurrent = Math.max(maxConcurrent, inside);
              await new Promise((r) => setTimeout(r, 20));
              inside--;
            },
            { waitMs: 5000, pollMs: 10 },
          ),
        ),
      );
      expect(maxConcurrent).toBe(1);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
