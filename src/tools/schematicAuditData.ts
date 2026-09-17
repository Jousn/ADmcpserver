import type { AltiumBridge } from "../bridge/altiumBridge.js";
import {
  type AuditPin,
  type AuditWire,
  type AuditPort,
  type AuditLabel,
  type AuditJunction,
  type AuditPinNet,
} from "./checkConnectivity.js";
import type { QualityComponent } from "./analyzeSchematicQuality.js";

/**
 * Shared schematic data fetcher used by check_connectivity and
 * analyze_schematic_quality: DM-layer pin nets + sheet geometry
 * (components/wires/power ports/net labels/junctions) + per-component
 * pin hotspots from get_component_info.
 */

export interface SheetScope {
  schematic_full_path?: string;
  project_full_path?: string;
  schematic_sheet_file_name?: string;
}

export interface SchematicAuditData {
  pins: AuditPin[];
  wires: AuditWire[];
  ports: AuditPort[];
  labels: AuditLabel[];
  junctions: AuditJunction[];
  pinNets: AuditPinNet[];
  components: QualityComponent[];
  dmAvailable: boolean;
  dmError?: string;
}

export async function fetchSchematicAuditData(
  bridge: AltiumBridge,
  sheet: SheetScope,
): Promise<SchematicAuditData> {
  // Authoritative layer: per-pin compiled net names (Pascal
  // CheckSchematicConnectivityData, mirrors the official Connectivity.pas).
  const pinNets: AuditPinNet[] = [];
  const dmResp = await bridge.executeCommand("check_connectivity", { ...sheet }, { timeoutMs: 240_000 });
  const dmAvailable = dmResp.success === true;
  if (dmAvailable) {
    const dm = (dmResp.result ?? {}) as {
      pin_nets?: Array<{
        designator?: string;
        pin?: string;
        net?: string;
        unconnected?: boolean;
      }>;
    };
    for (const row of dm.pin_nets ?? []) {
      if (!row.designator || !row.pin) continue;
      pinNets.push({
        designator: row.designator,
        pin: row.pin,
        net: String(row.net ?? ""),
        unconnected: row.unconnected === true,
      });
    }
  }

  const dataResp = await bridge.executeCommand("get_schematic_data", {
    ...sheet,
    include_queries: ["components", "wires", "power_ports", "net_labels", "junctions"],
  });
  if (!dataResp.success) {
    throw new Error(String(dataResp.error ?? "bridge error on get_schematic_data"));
  }
  const data = (dataResp.result ?? {}) as {
    components?: Array<{
      designator?: string;
      schematic_x?: number;
      schematic_y?: number;
      schematic_width?: number;
      schematic_height?: number;
      schematic_rotation?: number;
    }>;
    wires?: Array<{ vertices_mils?: Array<{ x_mils: number; y_mils: number }> }>;
    power_ports?: Array<{ text?: string; x_mils?: number; y_mils?: number }>;
    net_labels?: Array<{ text?: string; x_mils?: number; y_mils?: number }>;
    junctions?: Array<{ x_mils?: number; y_mils?: number }>;
  };

  const components: QualityComponent[] = (data.components ?? [])
    .filter(
      (c) =>
        typeof c.designator === "string" &&
        typeof c.schematic_x === "number" &&
        typeof c.schematic_y === "number",
    )
    .map((c) => ({
      designator: c.designator as string,
      x: c.schematic_x as number,
      y: c.schematic_y as number,
      // Altium Y-up: BoundingRectangle Bottom < Top, so exported height
      // (Bottom - Top) is negative — normalize with abs().
      width: typeof c.schematic_width === "number" ? Math.abs(c.schematic_width) : 0,
      height: typeof c.schematic_height === "number" ? Math.abs(c.schematic_height) : 0,
      rotation: typeof c.schematic_rotation === "number" ? c.schematic_rotation : 0,
    }));

  // Per-component pin hotspots (sequential — bridge is lock-serialized anyway).
  const pins: AuditPin[] = [];
  for (const comp of components) {
    const infoResp = await bridge.executeCommand(
      "schematic_edit",
      { action: "get_component_info", designator: comp.designator, ...sheet },
      { timeoutMs: 240_000 },
    );
    if (!infoResp.success) {
      throw new Error(
        `get_component_info failed for ${comp.designator}: ${String(infoResp.error ?? "unknown")}`,
      );
    }
    const info = (infoResp.result ?? {}) as {
      // Bridge wraps the payload: { action, sheet, details: { pins } }.
      details?: {
        pins?: Array<{
          designator?: string;
          name?: string;
          x_mils?: number;
          y_mils?: number;
          is_hidden?: boolean;
        }>;
      };
      pins?: Array<{
        designator?: string;
        name?: string;
        x_mils?: number;
        y_mils?: number;
        is_hidden?: boolean;
      }>;
    };
    const pinRows = info.details?.pins ?? info.pins ?? [];
    for (const p of pinRows) {
      if (typeof p.x_mils !== "number" || typeof p.y_mils !== "number") continue;
      pins.push({
        designator: comp.designator,
        pinDesignator: String(p.designator ?? p.name ?? "?"),
        pinName: String(p.name ?? ""),
        x: p.x_mils,
        y: p.y_mils,
        isHidden: p.is_hidden === true,
      });
    }
  }

  const wires: AuditWire[] = (data.wires ?? []).map((w, i) => ({
    index: i,
    vertices: (w.vertices_mils ?? []).map((v) => ({ x: v.x_mils, y: v.y_mils })),
  }));
  const ports: AuditPort[] = (data.power_ports ?? [])
    .filter((p) => typeof p.x_mils === "number" && typeof p.y_mils === "number")
    .map((p) => ({ net: String(p.text ?? "?"), x: p.x_mils as number, y: p.y_mils as number }));
  const labels: AuditLabel[] = (data.net_labels ?? [])
    .filter((l) => typeof l.x_mils === "number" && typeof l.y_mils === "number")
    .map((l) => ({ net: String(l.text ?? "?"), x: l.x_mils as number, y: l.y_mils as number }));
  const junctions: AuditJunction[] = (data.junctions ?? [])
    .filter((j) => typeof j.x_mils === "number" && typeof j.y_mils === "number")
    .map((j) => ({ x: j.x_mils as number, y: j.y_mils as number }));

  return {
    pins,
    wires,
    ports,
    labels,
    junctions,
    pinNets,
    components,
    dmAvailable,
    dmError: dmAvailable ? undefined : String(dmResp.error ?? "unknown"),
  };
}
