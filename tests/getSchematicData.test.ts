import { describe, expect, it } from "vitest";
import { getSchematicDataInputSchema } from "../src/tools/getSchematicData.js";

describe("getSchematicDataInputSchema", () => {
  it("accepts empty object (legacy mode)", () => {
    expect(() => getSchematicDataInputSchema.parse({})).not.toThrow();
  });

  it("accepts include_queries with several tokens", () => {
    const r = getSchematicDataInputSchema.parse({
      schematic_full_path: "D:/p/Sheet1.SchDoc",
      include_queries: ["sheet", "components", "wires"],
    });
    expect(r.include_queries).toEqual(["sheet", "components", "wires"]);
  });

  it("rejects unknown include token", () => {
    expect(() =>
      getSchematicDataInputSchema.parse({
        include_queries: ["not_a_real_bucket"],
      }),
    ).toThrow();
  });
});
