import { describe, expect, it } from "vitest";
import { editSchematicInputSchema } from "../src/tools/editSchematic.js";

const baseSheet = {
  schematic_full_path: "D:\\p\\s.SchDoc",
} as const;

describe("editSchematicInputSchema", () => {
  it("accepts add_bus with wire_points_csv", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "add_bus",
      wire_points_csv: "0,0,100,0",
    });
    expect(r.success).toBe(true);
  });

  it("accepts place_wire as alias of add_wire", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "place_wire",
      wire_points_csv: "0,0,100,0",
    });
    expect(r.success).toBe(true);
  });

  it("accepts place_net_label with same fields as add_net_label", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "place_net_label",
      net_name: "VCC",
      x_mils: 100,
      y_mils: 200,
    });
    expect(r.success).toBe(true);
  });

  it("rejects add_bus_entry when wire_points_csv has not exactly four numbers", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "add_bus_entry",
      wire_points_csv: "0,0,100,0,200,0",
    });
    expect(r.success).toBe(false);
  });

  it("accepts add_bus_entry with four numbers", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "add_bus_entry",
      wire_points_csv: " 100 , 200 , 150, 250 ",
    });
    expect(r.success).toBe(true);
  });

  it("rejects add_bus_entry when a token is not numeric", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "add_bus_entry",
      wire_points_csv: "0,0,x,0",
    });
    expect(r.success).toBe(false);
  });

  it("accepts place_power_port with power_port_style and coordinates", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "place_power_port",
      power_port_style: "gnd_power",
      x_mils: 100,
      y_mils: 200,
    });
    expect(r.success).toBe(true);
  });

  it("rejects place_power_port without power_port_style", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "place_power_port",
      x_mils: 0,
      y_mils: 0,
    });
    expect(r.success).toBe(false);
  });

  it("accepts place_gnd without power_port_style (defaults in bridge)", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "place_gnd",
      x_mils: 50,
      y_mils: 60,
    });
    expect(r.success).toBe(true);
  });

  it("accepts place_vcc with optional net_name", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "place_vcc",
      x_mils: 10,
      y_mils: 20,
      net_name: "3V3",
      show_net_name: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepts delete_object with point target", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "delete_object",
      object_type: "wire",
      x_mils: 5000,
      y_mils: 2900,
    });
    expect(r.success).toBe(true);
  });

  it("accepts delete_object with area target", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "delete_object",
      object_type: "net_label",
      x1_mils: 0,
      y1_mils: 0,
      x2_mils: 1000,
      y2_mils: 1000,
    });
    expect(r.success).toBe(true);
  });

  it("accepts delete_object component by designator", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "delete_object",
      object_type: "component",
      designator: "R1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects delete_object without a target", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "delete_object",
      object_type: "wire",
    });
    expect(r.success).toBe(false);
  });

  it("rejects delete_object component without designator", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "delete_object",
      object_type: "component",
      x_mils: 100,
      y_mils: 100,
    });
    expect(r.success).toBe(false);
  });

  it("accepts delete_object with delete_all=true", () => {
    const r = editSchematicInputSchema.safeParse({
      ...baseSheet,
      action: "delete_object",
      object_type: "wire",
      delete_all: true,
    });
    expect(r.success).toBe(true);
  });
});
