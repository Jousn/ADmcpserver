#!/usr/bin/env node
// pascal-gate.cjs — static gate for altium-scripts/*.pas (B29-class accident prevention).
//
// DelphiScript has no compiler gate on this machine: RunScript compiles the whole
// script project per invocation, and a single syntax error wedges EVERY bridge
// command behind a modal error dialog (incident B29). This gate catches the
// recurring accident patterns before they reach Altium:
//
//   R1  b29-missing-then   single-line `if/else if ... = nil` without `then`
//   R2  unescaped-json     `.Add('"' + X)` string concat without JSONEscapeString
//   R3  ansi-file-io       single-param SaveToFile/LoadFromFile (ANSI/GBK hazard;
//                          becomes blocking once T5 encoding work lands)
//   R4  preprocess-try     PCBServer.PreProcess without `try` within 10 lines
//
// Usage:
//   node scripts/pascal-gate.cjs [dir]          report-only (exit 0 always)
//   node scripts/pascal-gate.cjs [dir] --strict exit 1 on any violation
//   a line containing `gate-ok` (or the line above it) is exempt
//
// Exit codes: 0 = clean or report-only; 1 = violations under --strict; 2 = usage error.

const { readFileSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const dirArg = args.find((a) => !a.startsWith("--"));
// resolve (not join): an absolute dirArg must REPLACE the cwd prefix.
const scriptsDir = dirArg
  ? resolve(process.cwd(), dirArg)
  : join(__dirname, "..", "altium-scripts");

const RULE_IDS = ["R1-b29-missing-then", "R2-unescaped-json", "R3-ansi-file-io", "R4-preprocess-try"];

function listPasFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".pas"))
      .sort()
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

function isExempt(lines, idx) {
  const prev = idx > 0 ? lines[idx - 1] : "";
  return /gate-ok/.test(lines[idx]) || /gate-ok/.test(prev);
}

/** Returns rule_id or null for one line. */
function checkLine(line, upper) {
  // R1 — the exact B29 shape: a single-line if/else-if whose condition ends in
  // nil (`= nil` / `<> nil` / `> nil` ...) with no `then` (multi-line conditions
  // end elsewhere and pass; assignments ending in nil lack the if-keyword).
  if (/\b(if|else\s+if)\b/i.test(line) && /\bnil\s*;?\s*$/i.test(upper) && !/\bthen\b/i.test(upper)) {
    return "R1-b29-missing-then";
  }
  // R2 — raw user-ish text concatenated into a quoted JSON fragment.
  if (/\.Add\('"'\s*\+/i.test(line) && !/JSONEscapeString/i.test(upper)) {
    return "R2-unescaped-json";
  }
  // R3 — bridge-crossing file I/O without an explicit encoding parameter.
  if (/\.(SaveToFile|LoadFromFile)\(/i.test(line) && !/TEncoding/i.test(upper)) {
    return "R3-ansi-file-io";
  }
  return null;
}

function scanFile(path) {
  const violations = [];
  let lines;
  try {
    lines = readFileSync(path, "utf8").split(/\r?\n/);
  } catch (e) {
    return [{ line: 0, rule: "READ-FAILED", text: String(e).slice(0, 120) }];
  }
  const uppers = lines.map((l) => l.toUpperCase());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = uppers[i];
    if (isExempt(lines, i)) continue;
    // Skip pure comment lines — docs often mention the APIs we gate on.
    if (line.trim().startsWith("//")) continue;

    const rule = checkLine(line, upper);
    if (rule) {
      violations.push({ line: i + 1, rule, text: line.trim().slice(0, 120) });
    }

    // R4 — PreProcess opens a PCB server transaction; a missing try..finally
    // around the body leaves the server in the transaction state on exceptions.
    if (/\bPreProcess\b/i.test(upper)) {
      let foundTry = false;
      for (let j = i; j <= i + 10 && j < lines.length; j++) {
        if (/\btry\b/i.test(uppers[j])) {
          foundTry = true;
          break;
        }
      }
      if (!foundTry) {
        violations.push({ line: i + 1, rule: "R4-preprocess-try", text: line.trim().slice(0, 120) });
      }
    }
  }
  return violations;
}

const files = listPasFiles(scriptsDir);
if (files.length === 0) {
  console.error(`pascal-gate: no .pas files found in ${scriptsDir}`);
  process.exit(2);
}

let total = 0;
for (const f of files) {
  const vs = scanFile(f);
  const rel = f.slice(f.lastIndexOf("\\") + 1).slice(f.lastIndexOf("/") + 1);
  for (const v of vs) {
    total++;
    console.log(`${rel}:${v.line} [${v.rule}] ${v.text}`);
  }
}

console.log(`pascal-gate: ${files.length} file(s) scanned, ${total} violation(s)${strict ? " (strict)" : " (report-only — pass --strict to block)"}`);
process.exit(strict && total > 0 ? 1 : 0);
