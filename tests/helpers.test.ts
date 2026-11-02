import { describe, expect, it } from "vitest";
import { errResult, jsonResult } from "../src/tools/helpers.js";

describe("jsonResult", () => {
  it("stringifies objects", () => {
    const r = jsonResult({ a: 1 });
    expect(r.content[0].type).toBe("text");
    expect(r.content[0].text).toContain('"a"');
  });
});

describe("errResult", () => {
  it("marks the tool result as an error (MCP CallToolResult contract)", () => {
    const r = errResult("File not found: X");
    expect(r.isError).toBe(true);
    expect(r.content[0].type).toBe("text");
    expect(r.content[0].text).toContain("File not found");
  });
});
