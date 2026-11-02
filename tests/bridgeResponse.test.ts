import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBridgeResponseSnapshot } from "../src/bridge/altiumBridge.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "altium-mcp-resp-"));
}

const VALID_OK = JSON.stringify({ success: true, result: { ping: "pong" } });
const VALID_FAIL = JSON.stringify({ success: false, error: "SOME_ERROR" });

describe("readBridgeResponseSnapshot (poll-again semantics)", () => {
  it("missing file -> not-ready/no-file", () => {
    const dir = tempDir();
    try {
      const snap = readBridgeResponseSnapshot(join(dir, "response.json"));
      expect(snap.state).toBe("not-ready");
      expect(snap.kind).toBe("no-file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("half-written JSON -> not-ready/parse (was: immediate RESPONSE_READ_FAILED)", () => {
    const dir = tempDir();
    try {
      const p = join(dir, "response.json");
      writeFileSync(p, '{ "success": tru', "utf8");
      const snap = readBridgeResponseSnapshot(p);
      expect(snap.state).toBe("not-ready");
      expect(snap.kind).toBe("parse");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("valid JSON, wrong shape -> not-ready/schema (was: immediate INVALID_BRIDGE_RESPONSE)", () => {
    const dir = tempDir();
    try {
      const p = join(dir, "response.json");
      writeFileSync(p, '{"foo": 1}', "utf8");
      const snap = readBridgeResponseSnapshot(p);
      expect(snap.state).toBe("not-ready");
      expect(snap.kind).toBe("schema");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("valid success response -> ok", () => {
    const dir = tempDir();
    try {
      const p = join(dir, "response.json");
      writeFileSync(p, VALID_OK, "utf8");
      const snap = readBridgeResponseSnapshot(p);
      expect(snap.state).toBe("ok");
      if (snap.state === "ok") expect(snap.response.success).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("valid failure response -> ok (failure payloads are valid responses)", () => {
    const dir = tempDir();
    try {
      const p = join(dir, "response.json");
      writeFileSync(p, VALID_FAIL, "utf8");
      const snap = readBridgeResponseSnapshot(p);
      expect(snap.state).toBe("ok");
      if (snap.state === "ok") {
        expect(snap.response.success).toBe(false);
        expect(snap.response.error).toBe("SOME_ERROR");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requestId matching: mismatch -> stale, match -> ok, absent id tolerated when schema expects none", () => {
    const dir = tempDir();
    try {
      const p = join(dir, "response.json");
      writeFileSync(p, JSON.stringify({ success: true, result: {}, requestId: 7 }), "utf8");
      expect(readBridgeResponseSnapshot(p, 3).state).toBe("stale"); // 7 != 3
      expect(readBridgeResponseSnapshot(p, 7).state).toBe("ok"); // match
      expect(readBridgeResponseSnapshot(p).state).toBe("ok"); // no correlation expected
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
