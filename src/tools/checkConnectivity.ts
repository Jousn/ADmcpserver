import * as z from "zod/v4";

/**
 * check_connectivity: electrical audit of a schematic sheet.
 *
 * Two data layers:
 *
 * 1. COMPILED DM LAYER (authoritative) — from the Pascal-side
 *    CheckSchematicConnectivityData (Altium_API.pas 'check_connectivity'
 *    command), which mirrors the official Connectivity.pas example:
 *    Project.DM_Compile, then Pin.DM_FlattenedNetName per pin. The Altium
 *    compiler itself resolves wires / junctions / T-contacts / crossings /
 *    power ports / net labels, so short/float verdicts come from it.
 *
 * 2. GEOMETRIC LAYER (supplement) — wires/power ports/net labels/junctions
 *    from get_schematic_data plus pin hotspots from get_component_info.
 *    Used for issues the compiler does not report (dangling wire endpoints,
 *    labels not touching wires, T-contacts without junction dots) and as a
 *    fallback when the DM layer is unavailable.
 */

export const checkConnectivityInputSchema = z.object({
  schematic_full_path: z
    .string()
    .optional()
    .describe(
      "Absolute path to one .SchDoc that is a logical document of an open project. Example: D:/Design/Board/Sheet1.SchDoc",
    ),
  project_full_path: z.string().optional().describe("Absolute path to an open .PrjPcb."),
  schematic_sheet_file_name: z
    .string()
    .optional()
    .describe("File name of the sheet (e.g. Sheet1.SchDoc). Scoped to focused project or project_full_path."),
});

export type CheckConnectivityInput = z.infer<typeof checkConnectivityInputSchema>;

// ---------------------------------------------------------------------------
// Input shapes (already-fetched data, mils)
// ---------------------------------------------------------------------------

export interface AuditPin {
  designator: string;
  pinDesignator: string;
  pinName: string;
  x: number;
  y: number;
  isHidden: boolean;
}

/** Per-pin compiled net row from the DM layer (Pascal CheckSchematicConnectivityData). */
export interface AuditPinNet {
  designator: string;
  pin: string;
  net: string;
  unconnected: boolean;
}

export interface AuditWire {
  index: number;
  vertices: Array<{ x: number; y: number }>;
}

export interface AuditPort {
  net: string;
  x: number;
  y: number;
}

export interface AuditLabel {
  net: string;
  x: number;
  y: number;
}

export interface AuditJunction {
  x: number;
  y: number;
}

export interface AuditInput {
  pins: AuditPin[];
  wires: AuditWire[];
  ports: AuditPort[];
  labels: AuditLabel[];
  junctions: AuditJunction[];
  /** DM layer rows; omit/empty = geometry fallback mode. */
  pinNets?: AuditPinNet[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface AuditIssue {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface AuditNet {
  name: string;
  pins: string[];
  ports: string[];
  labels: string[];
  wires: number[];
}

export interface AuditReport {
  ok: boolean;
  data_source: "compiled-dm" | "geometry-fallback";
  summary: {
    pins_total: number;
    pins_connected: number;
    pins_floating: number;
    wires: number;
    nets: number;
    errors: number;
    warnings: number;
  };
  nets: AuditNet[];
  errors: AuditIssue[];
  warnings: AuditIssue[];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const EPS = 1.0;

interface Seg {
  wireIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function segsOf(wire: AuditWire): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < wire.vertices.length; i++) {
    out.push({
      wireIndex: wire.index,
      x1: wire.vertices[i].x,
      y1: wire.vertices[i].y,
      x2: wire.vertices[i + 1].x,
      y2: wire.vertices[i + 1].y,
    });
  }
  return out;
}

function pointOnSeg(px: number, py: number, s: Seg, eps = EPS): boolean {
  const minX = Math.min(s.x1, s.x2) - eps;
  const maxX = Math.max(s.x1, s.x2) + eps;
  const minY = Math.min(s.y1, s.y2) - eps;
  const maxY = Math.max(s.y1, s.y2) + eps;
  if (px < minX || px > maxX || py < minY || py > maxY) return false;
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = px - s.x1;
    const ey = py - s.y1;
    return ex * ex + ey * ey <= eps * eps;
  }
  const cross = Math.abs((px - s.x1) * dy - (py - s.y1) * dx);
  if (cross / Math.sqrt(len2) > eps) return false;
  const t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  const tEps = eps / Math.sqrt(len2);
  return t >= -tEps && t <= 1 + tEps;
}

function atWireVertex(px: number, py: number, wire: AuditWire, eps = EPS): boolean {
  return wire.vertices.some((v) => Math.abs(v.x - px) <= eps && Math.abs(v.y - py) <= eps);
}

function ptEq(ax: number, ay: number, bx: number, by: number, eps = EPS): boolean {
  return Math.abs(ax - bx) <= eps && Math.abs(ay - by) <= eps;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Union-Find
// ---------------------------------------------------------------------------

class DisjointSet {
  private parent = new Map<string, string>();

  find(a: string): string {
    let root = a;
    while (this.parent.get(root) !== undefined && this.parent.get(root) !== root) {
      root = this.parent.get(root) as string;
    }
    let cur = a;
    while (this.parent.get(cur) !== undefined && this.parent.get(cur) !== cur) {
      const next = this.parent.get(cur) as string;
      this.parent.set(cur, root);
      cur = next;
    }
    this.parent.set(root, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  same(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }
}

// ---------------------------------------------------------------------------
// Geometric clustering (wires touching pins/ports/labels/junctions).
// Used for: power-port -> net association, fallback mode, geometry warnings.
// ---------------------------------------------------------------------------

interface GeoClusters {
  ds: DisjointSet;
  wireKey: (w: AuditWire) => string;
  pinKey: (p: AuditPin) => string;
  portKey: (i: number) => string;
  labelKey: (i: number) => string;
  tContactWarnings: AuditIssue[];
}

export function buildGeometricClusters(input: AuditInput): GeoClusters {
  const { pins, wires, ports, labels, junctions } = input;
  const visiblePins = pins.filter((p) => !p.isHidden);
  const allSegs = wires.flatMap(segsOf);
  const ds = new DisjointSet();
  const tContactWarnings: AuditIssue[] = [];

  const wireKey = (w: AuditWire) => `wire:${w.index}`;
  const pinKey = (p: AuditPin) => `pin:${p.designator}.${p.pinDesignator || p.pinName}`;
  const portKey = (i: number) => `port:${i}`;
  const labelKey = (i: number) => `label:${i}`;

  for (const p of visiblePins) {
    for (const seg of allSegs) {
      if (pointOnSeg(p.x, p.y, seg)) ds.union(pinKey(p), `wire:${seg.wireIndex}`);
    }
    for (let i = 0; i < ports.length; i++) {
      if (ptEq(p.x, p.y, ports[i].x, ports[i].y)) ds.union(pinKey(p), portKey(i));
    }
  }

  // Wire-to-wire: vertex-on-segment contact connects (endpoint semantics);
  // pure X crossings (no shared vertex) only connect via a junction (below).
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const a = wires[i];
      const b = wires[j];
      const contacts: Array<{ x: number; y: number; midSpan: boolean }> = [];
      for (const va of a.vertices) {
        for (const sb of segsOf(b)) {
          if (pointOnSeg(va.x, va.y, sb)) contacts.push({ x: va.x, y: va.y, midSpan: !atWireVertex(va.x, va.y, b) });
        }
      }
      for (const vb of b.vertices) {
        for (const sa of segsOf(a)) {
          if (pointOnSeg(vb.x, vb.y, sa)) contacts.push({ x: vb.x, y: vb.y, midSpan: !atWireVertex(vb.x, vb.y, a) });
        }
      }
      const deduped = dedupeContacts(contacts);
      if (deduped.length > 0) ds.union(wireKey(a), wireKey(b));
      for (const c of deduped) {
        if (c.midSpan && !junctions.some((jn) => ptEq(jn.x, jn.y, c.x, c.y))) {
          tContactWarnings.push({
            code: "T_CONTACT_NO_JUNCTION",
            message: `Wire #${a.index} terminates on wire #${b.index} mid-span at (${round(c.x)}, ${round(c.y)}) without a junction dot. Add add_junction there to make the T-junction explicit and visible.`,
            detail: { wire_a: a.index, wire_b: b.index, x: round(c.x), y: round(c.y) },
          });
        }
      }
    }
  }

  // Junctions connect every wire (and pin) passing through them — including
  // X crossings that would otherwise stay unconnected.
  for (const jn of junctions) {
    const jKey = `junction:${round(jn.x)},${round(jn.y)}`;
    for (const seg of allSegs) {
      if (pointOnSeg(jn.x, jn.y, seg)) ds.union(jKey, `wire:${seg.wireIndex}`);
    }
    for (const p of visiblePins) {
      if (ptEq(p.x, p.y, jn.x, jn.y)) ds.union(jKey, pinKey(p));
    }
  }

  return { ds, wireKey, pinKey, portKey, labelKey, tContactWarnings };
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

export function analyzeConnectivity(input: AuditInput): AuditReport {
  const { pins, wires, ports, labels, junctions } = input;
  const pinNets = input.pinNets ?? [];
  const visiblePins = pins.filter((p) => !p.isHidden);
  const geo = buildGeometricClusters(input);
  const powerNetNames = new Set(ports.map((p) => p.net.toUpperCase()));

  const errors: AuditIssue[] = [];
  const warnings: AuditIssue[] = [...geo.tContactWarnings];

  const nets: AuditNet[] = [];
  let pinsFloating = 0;
  let pinsConnected = 0;

  if (pinNets.length > 0) {
    // ---------------------------------------------------------------------
    // AUTHORITATIVE MODE: group pins by the compiler's flattened net name.
    // ---------------------------------------------------------------------
    const byNet = new Map<string, string[]>();
    for (const row of pinNets) {
      const name = row.unconnected ? "?" : row.net;
      const list = byNet.get(name) ?? [];
      list.push(`${row.designator}.${row.pin}`);
      byNet.set(name, list);
    }

    for (const [netName, netPins] of byNet) {
      if (netName === "?") {
        pinsFloating += netPins.length;
        for (const pin of netPins) {
          errors.push({
            code: "FLOAT_PIN",
            message: `Pin ${pin} is not connected to any net (compiler reports '?' net) — no wire/power port touches it.`,
            detail: { pin },
          });
        }
        continue;
      }
      pinsConnected += netPins.length;

      // Ports/labels that carry this net name.
      const portNets = ports.filter((p) => p.net.toUpperCase() === netName.toUpperCase()).map((p) => p.net);
      const labelNets = labels.filter((l) => l.net.toUpperCase() === netName.toUpperCase()).map((l) => l.net);

      nets.push({
        name: netName,
        pins: netPins.sort(),
        ports: [...new Set(portNets)],
        labels: [...new Set(labelNets)],
        wires: [],
      });

      // SHORT_ACROSS_COMPONENT: several pins of one component on one net.
      const byComp = new Map<string, string[]>();
      for (const pin of netPins) {
        const comp = pin.split(".")[0];
        const list = byComp.get(comp) ?? [];
        list.push(pin);
        byComp.set(comp, list);
      }
      for (const [comp, list] of byComp) {
        if (list.length < 2) continue;
        // Multi-pin parts legitimately share POWER nets (e.g. an IC with two
        // GND pins). For anything else — and always for 2-pin parts (a
        // resistor/cap/diode bridged by wiring) — pins of one part on one net
        // means the part is shorted by wiring.
        const totalPins = pinNets.filter((r) => r.designator === comp).length;
        const isPowerNet = powerNetNames.has(netName.toUpperCase());
        if (totalPins === 2 || !isPowerNet) {
          errors.push({
            code: "SHORT_ACROSS_COMPONENT",
            message: `Component ${comp} is SHORTED by wiring: pins ${list.join(" and ")} are on the same net "${netName}". A wire must terminate at ONE pin — never pass through a component body and touch both pin hotspots (typical case: vertical 2-pin part where a long wire runs through it). Delete the offending wire and re-route, terminating exactly at the target pin.`,
            detail: { component: comp, pins: list, net: netName },
          });
        }
      }
    }

    // POWER_NET_SHORT: two different power ports electrically merged.
    // Associate each port with the compiled net of the pins wired to it
    // (via the geometric cluster), then compare nets across port names.
    const portNetByIndex = new Map<number, string>();
    for (let i = 0; i < ports.length; i++) {
      let resolved: string | null = null;
      for (const p of visiblePins) {
        if (!geo.ds.same(geo.portKey(i), geo.pinKey(p))) continue;
        const row = pinNets.find((r) => r.designator === p.designator && r.pin === (p.pinDesignator || p.pinName));
        if (row && !row.unconnected) {
          resolved = row.net;
          break;
        }
      }
      if (resolved) portNetByIndex.set(i, resolved);
    }
    const netToPortNames = new Map<string, Set<string>>();
    for (const [i, netName] of portNetByIndex) {
      const set = netToPortNames.get(netName) ?? new Set<string>();
      set.add(ports[i].net.toUpperCase());
      netToPortNames.set(netName, set);
    }
    for (const [netName, portNames] of netToPortNames) {
      if (portNames.size >= 2) {
        errors.push({
          code: "POWER_NET_SHORT",
          message: `Power nets ${[...portNames].join(" and ")} are electrically MERGED into net "${netName}" — a short between different power nets. Check wires crossing/touching near this net.`,
          detail: { nets: [...portNames], merged_net: netName },
        });
      }
    }
  } else {
    // ---------------------------------------------------------------------
    // FALLBACK MODE: pure geometric clustering (no compiled data).
    // ---------------------------------------------------------------------
    interface Cluster {
      pins: string[];
      ports: Array<{ net: string }>;
      labels: Array<{ net: string }>;
      wires: number[];
    }
    const clusters = new Map<string, Cluster>();
    const clusterOf = (node: string): Cluster => {
      const root = geo.ds.find(node);
      let c = clusters.get(root);
      if (!c) {
        c = { pins: [], ports: [], labels: [], wires: [] };
        clusters.set(root, c);
      }
      return c;
    };
    for (const p of visiblePins) clusterOf(geo.pinKey(p)).pins.push(`${p.designator}.${p.pinDesignator || p.pinName}`);
    for (let i = 0; i < ports.length; i++) clusterOf(geo.portKey(i)).ports.push({ net: ports[i].net });
    for (let i = 0; i < labels.length; i++) clusterOf(geo.labelKey(i)).labels.push({ net: labels[i].net });
    for (const w of wires) clusterOf(geo.wireKey(w)).wires.push(w.index);

    for (const c of clusters.values()) {
      const names = [
        ...new Set([...c.ports.map((p) => p.net), ...c.labels.map((l) => l.net)].map((n) => n.toUpperCase())),
      ];
      nets.push({
        name: names.length > 0 ? names.join("/") : "(unnamed)",
        pins: c.pins.sort(),
        ports: [...new Set(c.ports.map((p) => p.net))],
        labels: [...new Set(c.labels.map((l) => l.net))],
        wires: c.wires.sort((a, b) => a - b),
      });
      if (names.length >= 2) {
        errors.push({
          code: "NET_NAME_SHORT",
          message: `Nets ${names.join(" and ")} are merged into one cluster (geometry-only analysis) — suspected short between different named nets.`,
          detail: { nets: names, pins: c.pins },
        });
      }
    }

    // Floating = pin touched by no wire, port, or junction.
    for (const p of visiblePins) {
      let connected = false;
      for (const w of wires) {
        if (geo.ds.same(geo.pinKey(p), geo.wireKey(w))) {
          connected = true;
          break;
        }
      }
      if (!connected) {
        for (let i = 0; i < ports.length; i++) {
          if (geo.ds.same(geo.pinKey(p), geo.portKey(i))) {
            connected = true;
            break;
          }
        }
      }
      if (connected) pinsConnected++;
      else {
        pinsFloating++;
        errors.push({
          code: "FLOAT_PIN",
          message: `Pin ${p.designator}.${p.pinDesignator || p.pinName} at (${p.x}, ${p.y}) is not touched by any wire or power port (geometry-only analysis) — floating.`,
          detail: { pin: `${p.designator}.${p.pinDesignator || p.pinName}`, x: p.x, y: p.y },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Geometry warnings (both modes): labels not on wires, dangling endpoints.
  // -------------------------------------------------------------------------
  const allSegs = wires.flatMap(segsOf);
  for (const lab of labels) {
    if (!allSegs.some((s) => pointOnSeg(lab.x, lab.y, s))) {
      warnings.push({
        code: "LABEL_NOT_ON_WIRE",
        message: `Net label "${lab.net}" at (${lab.x}, ${lab.y}) does not touch any wire — it has no effect.`,
        detail: { net: lab.net, x: lab.x, y: lab.y },
      });
    }
  }
  for (const w of wires) {
    for (const v of w.vertices) {
      let touched =
        visiblePins.some((p) => ptEq(v.x, v.y, p.x, p.y)) ||
        ports.some((p) => ptEq(v.x, v.y, p.x, p.y)) ||
        labels.some((l) => ptEq(v.x, v.y, l.x, l.y)) ||
        junctions.some((jn) => ptEq(v.x, v.y, jn.x, jn.y));
      if (!touched) {
        touched = wires.some(
          (other) =>
            other.index !== w.index && segsOf(other).some((s) => pointOnSeg(v.x, v.y, s)),
        );
      }
      if (!touched) {
        warnings.push({
          code: "DANGLING_WIRE_ENDPOINT",
          message: `Wire #${w.index} vertex (${round(v.x)}, ${round(v.y)}) touches no pin, port, label, junction, or other wire — dangling wire end.`,
          detail: { wire: w.index, x: round(v.x), y: round(v.y) },
        });
      }
    }
  }

  dedupeIssues(errors);
  dedupeIssues(warnings);
  nets.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const pinsTotal = pinNets.length > 0 ? pinNets.length : visiblePins.length;
  return {
    ok: errors.length === 0,
    data_source: pinNets.length > 0 ? "compiled-dm" : "geometry-fallback",
    summary: {
      pins_total: pinsTotal,
      pins_connected: pinsConnected,
      pins_floating: pinsFloating,
      wires: wires.length,
      nets: nets.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    nets,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function dedupeContacts(
  contacts: Array<{ x: number; y: number; midSpan: boolean }>,
): Array<{ x: number; y: number; midSpan: boolean }> {
  const out: Array<{ x: number; y: number; midSpan: boolean }> = [];
  for (const c of contacts) {
    const dup = out.find((o) => ptEq(o.x, o.y, c.x, c.y));
    if (dup) dup.midSpan = dup.midSpan && c.midSpan;
    else out.push({ ...c });
  }
  return out;
}

function dedupeIssues(issues: AuditIssue[]): void {
  const seen = new Set<string>();
  for (let i = issues.length - 1; i >= 0; i--) {
    const key = `${issues[i].code}|${issues[i].message}`;
    if (seen.has(key)) issues.splice(i, 1);
    else seen.add(key);
  }
}
