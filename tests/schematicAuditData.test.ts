import { describe, expect, it } from "vitest";
import { fetchSchematicAuditData } from "../src/tools/schematicAuditData.js";
import type { AuditPin } from "../src/tools/checkConnectivity.js";

type BridgeCall = { command: string; params: Record<string, unknown> };

interface FakeResp {
  success: boolean;
  result?: unknown;
  error?: string;
}

function makeBridge(handlers: {
  get_schematic_data: FakeResp;
  get_all_pin_hotspots?: FakeResp;
  schematic_edit?: (designator: string) => FakeResp;
}) {
  const calls: BridgeCall[] = [];
  return {
    calls,
    bridge: {
      executeCommand: async (command: string, params: Record<string, unknown>): Promise<FakeResp> => {
        calls.push({ command, params });
        if (command === "get_schematic_data") return handlers.get_schematic_data;
        if (command === "get_all_pin_hotspots") {
          if (!handlers.get_all_pin_hotspots) return { success: false, error: "Unknown command" };
          return handlers.get_all_pin_hotspots;
        }
        if (command === "schematic_edit" && handlers.schematic_edit) {
          return handlers.schematic_edit(String(params.designator));
        }
        return { success: false, error: "unexpected command " + command };
      },
    } as unknown as Parameters<typeof fetchSchematicAuditData>[0],
  };
}

const SHEET_DATA = {
  success: true,
  result: {
    components: [
      { designator: "R1", schematic_x: 1000, schematic_y: 2000, schematic_width: 400, schematic_height: 200, schematic_rotation: 0 },
    ],
    wires: [],
    power_ports: [],
    net_labels: [],
    junctions: [],
  },
};

describe("fetchSchematicAuditData batch pin hotspots (T8)", () => {
  it("uses ONE get_all_pin_hotspots round trip when available", async () => {
    const h = makeBridge({
      get_schematic_data: SHEET_DATA,
      get_all_pin_hotspots: {
        success: true,
        result: {
          component_count: 1,
          components: [
            {
              designator: "R1",
              pin_count: 2,
              pins: [
                { name: "1", designator: "1", x_mils: 900, y_mils: 2000, is_hidden: false },
                { name: "2", designator: "2", x_mils: 1100, y_mils: 2000, is_hidden: false },
              ],
            },
          ],
        },
      },
    });
    const data = await fetchSchematicAuditData(h.bridge, { schematic_full_path: "X.SchDoc" });
    expect(data.dmAvailable).toBe(false); // no check_connectivity call in this fake
    const editCalls = h.calls.filter((c) => c.command === "schematic_edit");
    expect(editCalls).toHaveLength(0); // fallback NOT used
    expect(h.calls.filter((c) => c.command === "get_all_pin_hotspots")).toHaveLength(1);
    const r1pins = data.pins.filter((p: AuditPin) => p.designator === "R1");
    expect(r1pins).toHaveLength(2);
    expect(r1pins[0]).toMatchObject({ pinDesignator: "1", x: 900, y: 2000, isHidden: false });
  });

  it("falls back to per-component get_component_info when batch command is unknown", async () => {
    const h = makeBridge({
      get_schematic_data: SHEET_DATA,
      schematic_edit: (designator: string) => ({
        success: true,
        result: {
          details: {
            pins: [
              { name: "1", designator: "1", x_mils: 900, y_mils: 2000, is_hidden: false },
            ],
          },
        },
      }),
    });
    const data = await fetchSchematicAuditData(h.bridge, { schematic_full_path: "X.SchDoc" });
    const hotCalls = h.calls.filter((c) => c.command === "get_all_pin_hotspots");
    expect(hotCalls).toHaveLength(1); // attempted once
    const editCalls = h.calls.filter((c) => c.command === "schematic_edit");
    expect(editCalls).toHaveLength(1); // fallback used for R1
    expect(data.pins).toHaveLength(1);
    expect(data.pins[0]).toMatchObject({ designator: "R1", pinDesignator: "1", x: 900 });
  });

  it("carries componentParameters from get_schematic_data", async () => {
    const h = makeBridge({
      get_schematic_data: {
        success: true,
        result: {
          components: [
            {
              designator: "C1",
              schematic_x: 0,
              schematic_y: 0,
              schematic_width: 400,
              schematic_height: 200,
              schematic_rotation: 0,
              parameters: { Value: "0.1uF", Description: "电容" },
            },
          ],
          wires: [],
          power_ports: [],
          net_labels: [],
          junctions: [],
        },
      },
      get_all_pin_hotspots: { success: true, result: { components: [] } },
    });
    const data = await fetchSchematicAuditData(h.bridge, {});
    expect(data.componentParameters["C1"]).toEqual({ Value: "0.1uF", Description: "电容" });
  });
});
