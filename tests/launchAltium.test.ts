import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { launchAltiumRunScript, observeLaunchProcess } from "../src/bridge/altiumBridge.js";

describe("launchAltiumRunScript launch detection", () => {
  it("returns false fast for a nonexistent exe (was: dead-path, surfaced as 120s TIMEOUT)", async () => {
    const t0 = Date.now();
    const ok = await launchAltiumRunScript("C:\\definitely\\not\\here\\nope.exe", "whatever.PrjScr", {
      observeMs: 3_000,
    });
    const elapsed = Date.now() - t0;
    expect(ok).toBe(false);
    // Must settle via quick non-zero exit, not by waiting out the window.
    expect(elapsed).toBeLessThan(3_000);
  }, 15_000);
});

describe("observeLaunchProcess verdicts", () => {
  it("still running at window end -> true (Altium launching normally)", async () => {
    const child = spawn("ping -n 30 127.0.0.1", { shell: true, stdio: "ignore" });
    try {
      const ok = await observeLaunchProcess(child, 1_000);
      expect(ok).toBe(true);
    } finally {
      child.kill();
    }
  }, 15_000);

  it("quick zero exit -> true (forwarder handing off to a running instance)", async () => {
    const t0 = Date.now();
    const child = spawn('cmd /c "exit 0"', { shell: true, stdio: "ignore" });
    const ok = await observeLaunchProcess(child, 3_000);
    expect(ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3_000);
  }, 15_000);

  it("quick non-zero exit -> false (invocation rejected)", async () => {
    const t0 = Date.now();
    const child = spawn('cmd /c "exit 1"', { shell: true, stdio: "ignore" });
    const ok = await observeLaunchProcess(child, 3_000);
    expect(ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(3_000);
  }, 15_000);
});
