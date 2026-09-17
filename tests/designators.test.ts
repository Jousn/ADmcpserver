import { describe, expect, it } from "vitest";
import { parseDesignatorsFromComponentData } from "../src/tools/designators.js";

describe("parseDesignatorsFromComponentData", () => {
  it("parses JSON string payload", () => {
    const raw = JSON.stringify([{ designator: "R1" }, { designator: "U2" }]);
    expect(parseDesignatorsFromComponentData(raw)).toEqual(["R1", "U2"]);
  });

  it("parses array", () => {
    expect(parseDesignatorsFromComponentData([{ designator: "C1" }])).toEqual(["C1"]);
  });
});
