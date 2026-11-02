import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GATE = join(process.cwd(), "scripts", "pascal-gate.cjs");

function runGate(dir: string, extra: string[] = []): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [GATE, dir, ...extra], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, out: err.stdout ?? "" };
  }
}

function tempPasDir(): string {
  return mkdtempSync(join(tmpdir(), "pascal-gate-"));
}

describe("pascal-gate (T9 static gate)", () => {
  it("catches all four accident patterns", () => {
    const dir = tempPasDir();
    try {
      writeFileSync(
        join(dir, "sample.pas"),
        [
          "begin",
          // NB: keep comments below free of the keywords "then"/"try" — the
          // gate matches on the whole line including trailing comments.
          "  else if RealMatch <> nil;",
          "  AllSymbolsArray.Add('\"' + LibComp.LibReference + '\"');",
          "  F.SaveToFile(BRIDGE_ERROR_LOG);",
          "  PCBServer.PreProcess;",
          "  X := Y;",
          "end.",
        ].join("\n"),
        "utf8",
      );
      const r = runGate(dir);
      expect(r.out).toContain("R1-b29-missing-then");
      expect(r.out).toContain("R2-unescaped-json");
      expect(r.out).toContain("R3-ansi-file-io");
      expect(r.out).toContain("R4-preprocess-try");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes clean code and honors gate-ok exemptions", () => {
    const dir = tempPasDir();
    try {
      writeFileSync(
        join(dir, "clean.pas"),
        [
          "begin",
          "  if RealMatch <> nil then Exit;      // fine: has then",
          "  if RealMatch <> nil;  // gate-ok    // exempted anyway",
          "  Result := BuildJSONObject(ResultProps);",
          "end.",
        ].join("\n"),
        "utf8",
      );
      const r = runGate(dir);
      expect(r.code).toBe(0);
      expect(r.out).toContain("0 violation(s)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--strict exits 1 on violations, 0 when clean", () => {
    const dirty = tempPasDir();
    const clean = tempPasDir();
    try {
      writeFileSync(join(dirty, "x.pas"), "begin\n  F.SaveToFile(P);\nend.\n", "utf8");
      expect(runGate(dirty, ["--strict"]).code).toBe(1);
      writeFileSync(join(clean, "ok.pas"), "begin\nend.\n", "utf8");
      expect(runGate(clean, ["--strict"]).code).toBe(0);
    } finally {
      rmSync(dirty, { recursive: true, force: true });
      rmSync(clean, { recursive: true, force: true });
    }
  });
});
