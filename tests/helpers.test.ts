import { describe, expect, it } from "vitest";
import { jsonResult } from "../src/tools/helpers.js";

describe("jsonResult", () => {
  it("stringifies objects", () => {
    const r = jsonResult({ a: 1 });
    expect(r.content[0].type).toBe("text");
    expect(r.content[0].text).toContain('"a"');
  });
});
