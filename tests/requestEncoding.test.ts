import { describe, expect, it } from "vitest";
import { buildRequestFileBuffer } from "../src/bridge/altiumBridge.js";

describe("buildRequestFileBuffer (T5 request-direction UTF-16LE + BOM)", () => {
  it("starts with the UTF-16LE BOM bytes FF FE", () => {
    const buf = buildRequestFileBuffer({ command: "ping" });
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xfe);
  });

  it("parses back to the original body after BOM strip (ASCII round trip)", () => {
    const body = { command: "ping", requestId: 7, protocolVersion: 1 };
    const buf = buildRequestFileBuffer(body);
    const text = buf.slice(2).toString("utf16le");
    expect(JSON.parse(text)).toEqual(body);
  });

  it("Chinese parameters survive the encoding round trip", () => {
    const body = { command: "get_schematic_data", include_queries: ["components", "中文回路验证共模电感"] };
    const buf = buildRequestFileBuffer(body);
    const text = buf.slice(2).toString("utf16le");
    const parsed = JSON.parse(text) as typeof body;
    expect(parsed.include_queries).toEqual(["components", "中文回路验证共模电感"]);
  });

  it("is decodable the way TStringList.LoadFromFile sees it (BOM-detectable UTF-16LE)", () => {
    // VCL BOM auto-detect checks the first two bytes for FF FE (UTF-16LE) or
    // BB EF BF (UTF-8). Our buffer must carry exactly that signature.
    const buf = buildRequestFileBuffer({ command: "x" });
    const sig = buf.subarray(0, 2).toString("hex");
    expect(sig).toBe("fffe");
    // and the payload length must be even (UTF-16 code units)
    expect((buf.length - 2) % 2).toBe(0);
  });
});
