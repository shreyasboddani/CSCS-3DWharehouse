import { z } from "zod";
import type { Layout, Location, WarehouseConfig, Zone } from "./warehouse";

export const equipmentCatalog = [
  {
    id: "aisle",
    name: "Rack aisle",
    group: "Storage",
    width: 5.6,
    depth: 14.4,
    height: 4.05,
    color: "#477bae",
  },
  {
    id: "staging",
    name: "Staging lane",
    group: "Operations",
    width: 2,
    depth: 3,
    height: 0.15,
    color: "#18a399",
  },
  {
    id: "packing",
    name: "Packing station",
    group: "Operations",
    width: 2.4,
    depth: 2,
    height: 1,
    color: "#bc9453",
  },
  {
    id: "inbound",
    name: "Inbound dock",
    group: "Operations",
    width: 3.5,
    depth: 1.5,
    height: 4,
    color: "#3c7be8",
  },
  {
    id: "outbound",
    name: "Outbound dock",
    group: "Operations",
    width: 3.5,
    depth: 1.5,
    height: 4,
    color: "#357e83",
  },
  {
    id: "quality",
    name: "Quality inspection",
    group: "Operations",
    width: 2.4,
    depth: 2,
    height: 1,
    color: "#a18abf",
  },
  {
    id: "returns",
    name: "Returns lane",
    group: "Operations",
    width: 2,
    depth: 3,
    height: 0.15,
    color: "#b98668",
  },
  {
    id: "office",
    name: "Office / enclosed room",
    group: "Building",
    width: 6,
    depth: 5,
    height: 3,
    color: "#9caec6",
  },
  {
    id: "column",
    name: "Structural column",
    group: "Building",
    width: 0.5,
    depth: 0.5,
    height: 6,
    color: "#8b97a8",
  },
  {
    id: "stairs",
    name: "Staircase",
    group: "Building",
    width: 2,
    depth: 5,
    height: 4,
    color: "#879db7",
  },
  {
    id: "lift",
    name: "Goods lift",
    group: "Building",
    width: 3,
    depth: 3,
    height: 3,
    color: "#62798f",
  },
  {
    id: "exit",
    name: "Pedestrian exit",
    group: "Building",
    width: 1.2,
    depth: 0.4,
    height: 2.2,
    color: "#31a483",
  },
  {
    id: "belt",
    name: "Belt conveyor",
    group: "Automation",
    width: 1,
    depth: 6,
    height: 0.85,
    color: "#637c96",
  },
  {
    id: "roller",
    name: "Roller conveyor",
    group: "Automation",
    width: 1,
    depth: 6,
    height: 0.85,
    color: "#7c90a5",
  },
  {
    id: "sorter",
    name: "Sortation station",
    group: "Automation",
    width: 3,
    depth: 3,
    height: 1,
    color: "#7892b5",
  },
  {
    id: "asrs",
    name: "AS/RS storage block",
    group: "Automation",
    width: 5,
    depth: 10,
    height: 5,
    color: "#6276ba",
  },
  {
    id: "robot-arm",
    name: "Palletizing robot cell",
    group: "Robots",
    width: 3,
    depth: 3,
    height: 2.4,
    color: "#c38a4a",
  },
  {
    id: "amr",
    name: "AMR transport robot",
    group: "Robots",
    width: 0.8,
    depth: 1.1,
    height: 0.5,
    color: "#38a6af",
  },
  {
    id: "agv",
    name: "AGV pallet carrier",
    group: "Robots",
    width: 1.2,
    depth: 1.7,
    height: 0.8,
    color: "#4186b8",
  },
  {
    id: "tugger",
    name: "Autonomous tugger",
    group: "Robots",
    width: 1.1,
    depth: 2.2,
    height: 1.2,
    color: "#3d8d99",
  },
  {
    id: "forklift",
    name: "Forklift",
    group: "Equipment",
    width: 1.2,
    depth: 2.5,
    height: 2.5,
    color: "#d3a443",
  },
  {
    id: "charger",
    name: "Robot charging point",
    group: "Equipment",
    width: 1.2,
    depth: 0.6,
    height: 0.8,
    color: "#6296a7",
  },
  {
    id: "pallet-buffer",
    name: "Pallet buffer",
    group: "Equipment",
    width: 2.4,
    depth: 3,
    height: 0.3,
    color: "#b5a38a",
  },
  {
    id: "machine",
    name: "Processing workstation",
    group: "Equipment",
    width: 2,
    depth: 2,
    height: 1.6,
    color: "#75899f",
  },
] as const;
export type EquipmentKind = (typeof equipmentCatalog)[number]["id"];
export const mobileRobots: EquipmentKind[] = ["amr", "agv", "tugger"];
const pointSchema = z.object({
  x: z.number(),
  z: z.number(),
});
export const moduleSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  kind: z.enum([...equipmentCatalog.map((e) => e.id), "area"]),
  label: z.string().trim().min(1).max(80),
  x: z.number(),
  z: z.number(),
  width: z.number().min(0.2),
  depth: z.number().min(0.2),
  height: z.number().min(0.1),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
  zone: z
    .enum(["inbound", "staging", "storage", "packing", "outbound"])
    .optional(),
  number: z.number().int().min(1),
  bays: z.number().int().min(1),
  levels: z.number().int().min(1),
  bins: z.number().int().min(1),
  aisleWidth: z.number().min(0.6),
  binCapacity: z.number().int().min(1).max(1000000).optional(),
  unit: z.string().trim().min(1).max(20).default("units"),
  task: z
    .enum([
      "transport",
      "replenish",
      "pick-assist",
      "palletize",
      "sort",
      "charge",
      "idle",
    ])
    .default("idle"),
  speed: z.number().min(0.05).max(3).default(0.8),
  route: z.array(pointSchema).max(100).default([]),
  loop: z.boolean().default(false),
  sourceId: z.string().max(64).optional(),
  targetId: z.string().max(64).optional(),
});
export const floorSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/),
  name: z.string().trim().min(1).max(80),
  height: z.number().min(3),
  outline: z.array(pointSchema).min(3),
  modules: z.array(moduleSchema),
});
export const designSchema = z.object({
  version: z.literal(1),
  grid: z.number().positive(),
  floors: z.array(floorSchema).min(1),
});
/** Resize the shell and follow its proportions without scaling physical equipment. */
export function resizeDesign(
  design: Design,
  before: { width: number; depth: number },
  after: { width: number; depth: number },
): Design {
  const sx = after.width / before.width,
    sz = after.depth / before.depth;
  return {
    ...design,
    floors: design.floors.map((f) => ({
      ...f,
      outline: f.outline.map((p) => ({ x: p.x * sx, z: p.z * sz })),
      modules: f.modules.map((m) => {
        const next = {
          ...m,
          x: m.x * sx,
          z: m.z * sz,
          route: m.route.map((p) => ({ x: p.x * sx, z: p.z * sz })),
        };
        if (m.kind === "area") {
          next.width *= m.rotation % 180 ? sz : sx;
          next.depth *= m.rotation % 180 ? sx : sz;
        }
        if (m.kind === "aisle")
          next.bays = Math.max(
            1,
            Math.floor(m.bays * (m.rotation % 180 ? sx : sz)),
          );
        if (m.kind === "inbound" || m.kind === "outbound") {
          const anchor = localPoint(m, 0, -m.depth / 2),
            offset = localPoint({ ...m, x: 0, z: 0 }, 0, -m.depth / 2);
          next.x = anchor.x * sx - offset.x;
          next.z = anchor.z * sz - offset.z;
        }
        return next;
      }),
    })),
  };
}
export type Design = z.infer<typeof designSchema>;
export type DesignFloor = z.infer<typeof floorSchema>;
export type DesignModule = z.infer<typeof moduleSchema>;
export const shelfSectionsForLength = (length: number) =>
  Math.max(1, Math.round(length / 2.4));
export function updateDesignModule(
  floor: DesignFloor,
  id: string,
  patch: Partial<DesignModule>,
  growRoof = true,
): DesignFloor {
  const modules = floor.modules.map((m) =>
    m.id === id
      ? {
          ...m,
          ...patch,
          route: patch.route || m.route.map((p) => ({
            x: p.x + ((patch.x ?? m.x) - m.x),
            z: p.z + ((patch.z ?? m.z) - m.z),
          })),
        }
      : m,
  );
  const height = growRoof
    ? modules.reduce((h, m) => Math.max(
        h,
        (m.kind === "aisle" ? m.levels * 1.25 + 0.3 : m.height) + 1.5,
      ), floor.height)
    : floor.height;
  return { ...floor, modules, height };
}
export type DesignPoint = z.infer<typeof pointSchema>;
export function floorElevation(design: Design, index: number) {
  return design.floors.slice(0, index).reduce((y, f) => y + f.height + 0.3, 0);
}
export function moduleSize(m: DesignModule) {
  const width = m.kind === "aisle" ? m.aisleWidth + 2.4 : m.width;
  const depth = m.kind === "aisle" ? m.bays * 2.4 : m.depth;
  return m.rotation % 180 ? { width: depth, depth: width } : { width, depth };
}
export function localPoint(m: DesignModule, x: number, z: number): DesignPoint {
  const angle = (m.rotation * Math.PI) / 180;
  return {
    x: m.x + x * Math.cos(angle) - z * Math.sin(angle),
    z: m.z + x * Math.sin(angle) + z * Math.cos(angle),
  };
}
export function pointInside(p: DesignPoint, polygon: DesignPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i],
      cross = (p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x);
    if (
      Math.abs(cross) < 1e-7 &&
      p.x >= Math.min(a.x, b.x) - 1e-7 &&
      p.x <= Math.max(a.x, b.x) + 1e-7 &&
      p.z >= Math.min(a.z, b.z) - 1e-7 &&
      p.z <= Math.max(a.z, b.z) + 1e-7
    )
      return true;
    if (
      b.z > p.z !== a.z > p.z &&
      p.x < ((a.x - b.x) * (p.z - b.z)) / (a.z - b.z) + b.x
    )
      inside = !inside;
  }
  return inside;
}
export function polygonArea(points: DesignPoint[]) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.z - q.x * p.z;
      }, 0),
    ) / 2
  );
}
function orientation(a: DesignPoint, b: DesignPoint, c: DesignPoint) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}
function onSegment(a: DesignPoint, b: DesignPoint, p: DesignPoint) {
  return (
    Math.abs(orientation(a, b, p)) < 1e-7 &&
    p.x >= Math.min(a.x, b.x) - 1e-7 &&
    p.x <= Math.max(a.x, b.x) + 1e-7 &&
    p.z >= Math.min(a.z, b.z) - 1e-7 &&
    p.z <= Math.max(a.z, b.z) + 1e-7
  );
}
/** Check each boundary interval, including concave cutouts thinner than the grid. */
export function outlineWithin(inner: DesignPoint[], outer: DesignPoint[]) {
  return inner.every((a, index) => {
    if (!pointInside(a, outer)) return false;
    const b = inner[(index + 1) % inner.length],
      dx = b.x - a.x,
      dz = b.z - a.z,
      length2 = dx * dx + dz * dz;
    if (!length2) return false;
    const cuts = [0, 1];
    for (let j = 0; j < outer.length; j++) {
      const c = outer[j],
        d = outer[(j + 1) % outer.length],
        ex = d.x - c.x,
        ez = d.z - c.z;
      const denominator = dx * ez - dz * ex;
      if (Math.abs(denominator) > 1e-9) {
        const t = ((c.x - a.x) * ez - (c.z - a.z) * ex) / denominator;
        const u = ((c.x - a.x) * dz - (c.z - a.z) * dx) / denominator;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t);
      } else if (Math.abs(orientation(a, b, c)) < 1e-7) {
        for (const p of [c, d]) {
          const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2;
          if (t > 0 && t < 1) cuts.push(t);
        }
      }
    }
    cuts.sort((x, y) => x - y);
    return cuts.slice(1).every((t, i) => {
      const middle = (cuts[i] + t) / 2;
      return pointInside({ x: a.x + dx * middle, z: a.z + dz * middle }, outer);
    });
  });
}
function properCross(
  a: DesignPoint,
  b: DesignPoint,
  c: DesignPoint,
  d: DesignPoint,
) {
  return (
    orientation(a, b, c) * orientation(a, b, d) < 0 &&
    orientation(c, d, a) * orientation(c, d, b) < 0
  );
}
export function polygonCrosses(points: DesignPoint[]) {
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const a = points[i],
        b = points[(i + 1) % points.length],
        c = points[j],
        d = points[(j + 1) % points.length];
      if (
        properCross(a, b, c, d) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      )
        return true;
    }
  return false;
}
export function containsModule(floor: DesignFloor, m: DesignModule) {
  const { width, depth } = moduleSize(m);
  // A concave perimeter vertex strictly inside a rectangle proves it spans a cutout.
  if (
    floor.outline.some(
      (p) =>
        p.x > m.x - width / 2 + 1e-6 &&
        p.x < m.x + width / 2 - 1e-6 &&
        p.z > m.z - depth / 2 + 1e-6 &&
        p.z < m.z + depth / 2 - 1e-6,
    )
  )
    return false;
  const corners = [
    { x: m.x - width / 2, z: m.z - depth / 2 },
    { x: m.x + width / 2, z: m.z - depth / 2 },
    { x: m.x + width / 2, z: m.z + depth / 2 },
    { x: m.x - width / 2, z: m.z + depth / 2 },
  ];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < floor.outline.length; j++)
      if (
        properCross(
          corners[i],
          corners[(i + 1) % 4],
          floor.outline[j],
          floor.outline[(j + 1) % floor.outline.length],
        )
      )
        return false;
  // Check the rectangle perimeter as well as corners.
  for (let t = 0; t <= 1; t += 0.05)
    for (const p of [
      { x: m.x - width / 2 + width * t, z: m.z - depth / 2 },
      { x: m.x - width / 2 + width * t, z: m.z + depth / 2 },
      { x: m.x - width / 2, z: m.z - depth / 2 + depth * t },
      { x: m.x + width / 2, z: m.z - depth / 2 + depth * t },
    ])
      if (!pointInside(p, floor.outline)) return false;
  return true;
}
/** Extend an aisle at its current position, without crossing walls or fixtures. */
export function fitDesignAisle(
  floor: DesignFloor,
  aisle: DesignModule,
): DesignModule | undefined {
  if (aisle.kind !== "aisle") return undefined;
  const axis = aisle.rotation % 180 ? "x" : "z";
  const span =
    Math.max(...floor.outline.map((p) => p[axis])) -
    Math.min(...floor.outline.map((p) => p[axis]));
  let fitted: DesignModule | undefined;
  for (let bays = 1; bays <= Math.floor(span / 2.4); bays++) {
    const candidate = { ...aisle, bays };
    const walkingSpace: DesignModule = {
      ...candidate,
      kind: "area",
      width: candidate.aisleWidth + 3.4,
      depth: bays * 2.4 + 2,
    };
    if (
      !containsModule(floor, walkingSpace) ||
      floor.modules.some(
        (m) =>
          m.id !== aisle.id &&
          m.kind !== "area" &&
          modulesOverlap(candidate, m, 0.5),
      )
    )
      break;
    fitted = candidate;
  }
  return fitted;
}
/** Repair misplaced fixtures after a shape change. Keep IDs and valid placements. */
export function arrangeFloor(floor: DesignFloor): DesignFloor {
  const placed: DesignModule[] = [];
  const lowX = Math.min(...floor.outline.map((p) => p.x)),
    highX = Math.max(...floor.outline.map((p) => p.x));
  const lowZ = Math.min(...floor.outline.map((p) => p.z)),
    highZ = Math.max(...floor.outline.map((p) => p.z));
  const valid = (m: DesignModule) =>
    containsModule(floor, m) &&
    !placed.some((p) => p.kind !== "area" && modulesOverlap(m, p));
  const order = [...floor.modules].sort(
    (a, b) =>
      Number(!["inbound", "outbound"].includes(a.kind)) -
      Number(!["inbound", "outbound"].includes(b.kind)),
  );
  for (const original of order) {
    let next = { ...original };
    if (next.kind === "area") {
      placed.push(next);
      continue;
    }
    if (["inbound", "outbound"].includes(next.kind)) {
      const rear = [
        localPoint(next, -next.width / 2, -next.depth / 2),
        localPoint(next, next.width / 2, -next.depth / 2),
      ];
      const aligned = floor.outline.some((a, i) =>
        rear.every((p) =>
          onSegment(a, floor.outline[(i + 1) % floor.outline.length], p),
        ),
      );
      if (valid(next) && aligned) {
        placed.push(next);
        continue;
      }
      const candidates: DesignModule[] = [];
      for (let i = 0; i < floor.outline.length; i++) {
        const a = floor.outline[i],
          b = floor.outline[(i + 1) % floor.outline.length];
        const dx = b.x - a.x,
          dz = b.z - a.z,
          length = Math.hypot(dx, dz);
        if (Math.abs(dx) > 0.001 && Math.abs(dz) > 0.001) continue;
        if (length < next.width) continue;
        for (
          let t = next.width / 2;
          t <= length - next.width / 2 + 0.001;
          t += next.width + 0.5
        ) {
          const anchor = {
            x: a.x + (dx * t) / length,
            z: a.z + (dz * t) / length,
          };
          for (const rotation of [0, 90, 180, 270] as const) {
            const offset = localPoint(
              { ...next, x: 0, z: 0, rotation },
              0,
              -next.depth / 2,
            );
            const candidate = {
              ...next,
              rotation,
              x: anchor.x - offset.x,
              z: anchor.z - offset.z,
            };
            const rear = [
              localPoint(candidate, -candidate.width / 2, -candidate.depth / 2),
              localPoint(candidate, candidate.width / 2, -candidate.depth / 2),
            ];
            if (rear.every((p) => onSegment(a, b, p)) && valid(candidate))
              candidates.push(candidate);
          }
        }
      }
      candidates.sort(
        (a, b) =>
          Math.hypot(a.x - original.x, a.z - original.z) -
          Math.hypot(b.x - original.x, b.z - original.z),
      );
      next = candidates[0] || next;
    } else if (!valid(next)) {
      // Try short shelves before searching: an L-shaped room may have a shorter arm.
      if (next.kind === "aisle") {
        const fit = fitDesignAisle({ ...floor, modules: placed }, next);
        if (fit) next = { ...next, bays: Math.min(next.bays, fit.bays) };
      }
      if (!valid(next)) {
        const size = moduleSize(next),
          positions: DesignPoint[] = [];
        for (
          let z = lowZ + size.depth / 2 + 0.5;
          z <= highZ - size.depth / 2 - 0.5;
          z += size.depth + 0.6
        )
          for (
            let x = lowX + size.width / 2 + 0.5;
            x <= highX - size.width / 2 - 0.5;
            x += size.width + 0.6
          )
            positions.push({ x, z });
        positions.sort(
          (a, b) =>
            Math.hypot(a.x - next.x, a.z - next.z) -
            Math.hypot(b.x - next.x, b.z - next.z),
        );
        const target = positions.find((p) => valid({ ...next, ...p }));
        if (target)
          next = {
            ...next,
            ...target,
            route: next.route.map((p) => ({
              x: p.x + target.x - original.x,
              z: p.z + target.z - original.z,
            })),
          };
      }
    }
    placed.push(next);
  }
  const map = new Map(placed.map((m) => [m.id, m]));
  return { ...floor, modules: floor.modules.map((m) => map.get(m.id)!) };
}
export function modulesOverlap(
  a: DesignModule,
  b: DesignModule,
  clearance = 0,
) {
  const x = moduleSize(a),
    y = moduleSize(b);
  return (
    Math.abs(a.x - b.x) < (x.width + y.width) / 2 + clearance - 1e-6 &&
    Math.abs(a.z - b.z) < (x.depth + y.depth) / 2 + clearance - 1e-6
  );
}
export function createModule(
  kind: DesignModule["kind"],
  id: string,
  number: number,
  x = 0,
  z = 0,
): DesignModule {
  const entry = equipmentCatalog.find((e) => e.id === kind);
  return moduleSchema.parse({
    id,
    kind,
    label: entry ? `${entry.name} ${number}` : `Storage area ${number}`,
    number,
    x,
    z,
    width: entry?.width || 15,
    depth: entry?.depth || 15,
    height: entry?.height || 0.1,
    rotation: 0,
    bays: 6,
    levels: 3,
    bins: 2,
    aisleWidth: 3.2,
    zone: kind === "area" ? "storage" : undefined,
  });
}
export function outlineTemplate(
  shape: "rectangle" | "l-shape" | "t-shape",
  width: number,
  depth: number,
): DesignPoint[] {
  const x = width / 2,
    z = depth / 2;
  if (shape === "l-shape")
    return [
      { x: -x, z: -z },
      { x: x, z: -z },
      { x: x, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: z },
      { x: -x, z: z },
    ];
  if (shape === "t-shape")
    return [
      { x: -x, z: -z },
      { x: x, z: -z },
      { x: x, z: -z / 3 },
      { x: x / 3, z: -z / 3 },
      { x: x / 3, z: z },
      { x: -x / 3, z: z },
      { x: -x / 3, z: -z / 3 },
      { x: -x, z: -z / 3 },
    ];
  return [
    { x: -x, z: -z },
    { x: x, z: -z },
    { x: x, z: z },
    { x: -x, z: z },
  ];
}
/** Convert the canonical template positions without changing any existing logical address. */
export function designFromLayout(c: WarehouseConfig, layout: Layout): Design {
  const modules: DesignModule[] = [];
  for (const a of new Set(layout.racks.map((rack) => rack.aisle))) {
    const racks = layout.racks.filter((r) => r.aisle === a);
    const left = racks[0],
      right = racks[1];
    if (!left || !right) continue;
    modules.push({
      ...createModule("aisle", `aisle-${a}`, a, (left.x + right.x) / 2, left.z),
      bays: c.bays,
      levels: c.levels,
      bins: c.bins,
      aisleWidth: c.aisleWidth,
      height: c.levels * 1.25 + 0.3,
    });
  }
  for (const l of layout.locations.filter((l) => l.zone !== "storage")) {
    const kind: EquipmentKind = l.id.startsWith("QC")
      ? "quality"
      : l.id.startsWith("RET")
        ? "returns"
        : (l.zone as EquipmentKind);
    const number = Number(l.id.split("-")[1]);
    const m = createModule(kind, `module-${l.id}`, number, l.x, l.z);
    if (kind === "inbound" || kind === "outbound") {
      if (kind === "outbound" && c.template === "l-flow") {
        m.rotation = 90;
        m.x = c.width / 2 - 0.75;
      } else {
        m.z =
          (kind === "outbound" && c.template === "through" ? 1 : -1) *
          (c.depth / 2 - 0.75);
        if (kind === "outbound" && c.template === "through") m.rotation = 180;
      }
    }
    if (kind === "packing" && c.template === "l-flow") m.rotation = 90;
    modules.push(m);
  }
  return {
    version: 1,
    grid: 0.3048,
    floors: [
      {
        id: "floor-1",
        name: "Ground floor",
        height: c.ceilingHeight || Math.max(12, c.levels * 1.25 + 2.4),
        outline: outlineTemplate("rectangle", c.width, c.depth),
        modules,
      },
    ],
  };
}
export function distributeModules(
  floor: DesignFloor,
  ids: string[],
  axis: "x" | "z",
): DesignFloor {
  const selected = floor.modules
    .filter((m) => ids.includes(m.id))
    .sort((a, b) => a[axis] - b[axis]);
  if (selected.length < 3) return floor;
  const measure = (m: DesignModule) =>
    moduleSize(m)[axis === "x" ? "width" : "depth"];
  const start = selected[0][axis] - measure(selected[0]) / 2,
    end = selected.at(-1)![axis] + measure(selected.at(-1)!) / 2;
  const gap =
    (end - start - selected.reduce((n, m) => n + measure(m), 0)) /
    (selected.length - 1);
  let edge = start;
  const positions = new Map<string, number>();
  for (const m of selected) {
    positions.set(
      m.id,
      Math.round((edge + measure(m) / 2) * 1000000) / 1000000 || 0,
    );
    edge += measure(m) + gap;
  }
  return {
    ...floor,
    modules: floor.modules.map((m) => {
      const position = positions.get(m.id);
      if (position === undefined) return m;
      const delta = position - m[axis];
      return {
        ...m,
        [axis]: position,
        route: m.route.map((p) => ({ ...p, [axis]: p[axis] + delta })),
      };
    }),
  };
}
export function populateArea(
  floor: DesignFloor,
  area: DesignModule,
  kind: "aisle" | "staging" | "packing",
  prototype: DesignModule,
  makeId: () => string,
): DesignFloor {
  const size = moduleSize(prototype),
    zone = moduleSize(area),
    gap = kind === "aisle" ? 1.5 : 0.8;
  const cols = Math.floor((zone.width + 0.01) / (size.width + gap)),
    rows = Math.floor((zone.depth + 0.01) / (size.depth + gap));
  if (cols * rows < 1)
    throw new Error(
      "This area is too small for these shelves or tables. Make the area bigger or use smaller modules.",
    );
  let number = Math.max(
    0,
    ...floor.modules.filter((m) => m.kind === kind).map((m) => m.number),
  );
  const additions: DesignModule[] = [];
  for (let r = 0; r < rows; r++)
    for (let col = 0; col < cols; col++)
      additions.push({
        ...prototype,
        id: makeId(),
        number: ++number,
        label: `${equipmentCatalog.find((e) => e.id === kind)!.name} ${number}`,
        x: area.x + (col - (cols - 1) / 2) * (size.width + gap),
        z: area.z + (r - (rows - 1) / 2) * (size.depth + gap),
      });
  return { ...floor, modules: [...floor.modules, ...additions] };
}
export function generateDesignLayout(c: WarehouseConfig): Layout {
  const design = c.design!,
    errors: string[] = [],
    locations: Location[] = [],
    racks: Layout["racks"] = [];
  const centers: Layout["centers"] = {
    inbound: [0, 0],
    staging: [0, 0],
    storage: [0, 0],
    packing: [0, 0],
    outbound: [0, 0],
  };
  let routeChecks = 0;
  const seen = new Set<string>();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (new Set(design.floors.map((f) => f.id)).size !== design.floors.length)
    errors.push("Floor IDs must be unique.");
  design.floors.forEach((floor, fi) => {
    const y = floorElevation(design, fi),
      prefix = fi ? `${floor.id}-` : "";
    if (polygonArea(floor.outline) < 9 || polygonCrosses(floor.outline))
      errors.push(
        `${floor.name}: draw a building outline that does not cross itself and covers at least 97 ft².`,
      );
    if (
      new Set(floor.outline.map((p) => `${p.x},${p.z}`)).size !==
      floor.outline.length
    )
      errors.push(`${floor.name}: outline vertices must be distinct.`);
    if (
      floor.outline.some(
        (p) => Math.abs(p.x) > c.width / 2 || Math.abs(p.z) > c.depth / 2,
      )
    )
      errors.push(`${floor.name}: outline extends beyond the site dimensions.`);
    if (fi && !outlineWithin(floor.outline, design.floors[0].outline))
      errors.push(
        `${floor.name}: upper floors must lie within the ground floor footprint.`,
      );
    floor.modules.forEach((m, i) => {
      if (
        (m.sourceId &&
          !floor.modules.some((n) => n.id === m.sourceId && n.id !== m.id)) ||
        (m.targetId &&
          !floor.modules.some((n) => n.id === m.targetId && n.id !== m.id))
      )
        errors.push(
          `${m.label}: workflow source/destination must reference another module on this floor.`,
        );
      const clearance = robotClearance(m);
      if (m.route.some((p) => !designWalkable(p, floor, m.id, clearance)))
        errors.push(
          `${m.label}: a route waypoint is obstructed or outside the floor.`,
        );
      if (
        m.route.length &&
        Math.hypot(m.route[0].x - m.x, m.route[0].z - m.z) > 0.01
      )
        errors.push(`${m.label}: route must start at the robot position.`);
      if (seen.has(m.id)) errors.push(`Duplicate module ID: ${m.id}.`);
      seen.add(m.id);
      if (!containsModule(floor, m))
        errors.push(
          `${floor.name}: ${m.label} extends outside the floor outline.`,
        );
      if (
        (m.kind === "aisle" ? m.levels * 1.25 + 0.3 : m.height) >
        floor.height - 0.25
      )
        errors.push(`${floor.name}: ${m.label} exceeds ceiling clearance.`);
      if (m.kind !== "area")
        for (const n of floor.modules
          .slice(i + 1)
          .filter((n) => n.kind !== "area"))
          if (modulesOverlap(m, n))
            errors.push(`${floor.name}: ${m.label} overlaps ${n.label}.`);
      if (m.kind === "inbound" || m.kind === "outbound") {
        if (fi)
          errors.push(
            `${m.label}: vehicle docks are supported on the ground floor only.`,
          );
        const rear = [
          localPoint(m, -m.width / 2, -m.depth / 2),
          localPoint(m, m.width / 2, -m.depth / 2),
        ];
        if (
          !floor.outline.some((a, j) => {
            const b = floor.outline[(j + 1) % floor.outline.length];
            return rear.every((edge) => onSegment(a, b, edge));
          })
        )
          errors.push(
            `${m.label}: align the rear edge with a straight perimeter wall.`,
          );
      }
      if (m.route.length && !mobileRobots.includes(m.kind as EquipmentKind))
        errors.push(`${m.label}: only mobile robots can have a travel route.`);
      for (let j = 1; j < m.route.length; j++) {
        const a = m.route[j - 1],
          b = m.route[j],
          count = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.2);
        for (let k = 0; k <= count; k++) {
          if (++routeChecks > 25000) {
            errors.push(
              "Route complexity exceeds the preview limit. Simplify the route network.",
            );
            break;
          }
          const p = {
            x: a.x + ((b.x - a.x) * k) / (count || 1),
            z: a.z + ((b.z - a.z) * k) / (count || 1),
          };
          if (!designWalkable(p, floor, m.id, clearance)) {
            errors.push(
              `${m.label}: route crosses a fixture or leaves the floor. Redraw it with clearance.`,
            );
            break;
          }
        }
      }
      if (
        m.loop &&
        m.route.length > 1 &&
        Math.hypot(
          m.route[0].x - m.route.at(-1)!.x,
          m.route[0].z - m.route.at(-1)!.z,
        ) > 0.01
      )
        errors.push(
          `${m.label}: close a loop by ending at its first waypoint.`,
        );
      if (m.kind === "aisle") {
        for (const side of ["L", "R"]) {
          const x = (side === "L" ? -1 : 1) * (m.aisleWidth / 2 + 0.6),
            p = localPoint(m, x, 0);
          racks.push({
            x: p.x,
            z: p.z,
            length: m.bays * 2.4,
            height: m.levels * 1.25 + 0.3,
            aisle: m.number,
            side,
            rotation: m.rotation,
            floorId: floor.id,
            y,
            bays: m.bays,
            levels: m.levels,
            bins: m.bins,
            moduleId: m.id,
          });
          for (let b = 1; b <= m.bays; b++)
            for (let l = 1; l <= m.levels; l++)
              for (let bin = 1; bin <= m.bins; bin++) {
                const id = `${prefix}A${pad(m.number)}-${side}-B${pad(b)}-L${pad(l)}-${pad(bin)}`,
                  p = localPoint(
                    m,
                    x,
                    (b - (m.bays + 1) / 2) * 2.4 +
                      (bin - (m.bins + 1) / 2) * (2.2 / m.bins),
                  );
                locations.push({
                  id,
                  code: id,
                  zone: "storage",
                  label: `${floor.name} · Aisle ${m.number} · ${side} · Bay ${b} · Level ${l} · Bin ${bin}`,
                  x: p.x,
                  z: p.z,
                  y: y + (l - 1) * 1.25 + 0.35,
                  aisle: m.number,
                  side,
                  bay: b,
                  level: l,
                  bin,
                  floorId: floor.id,
                  moduleId: m.id,
                });
              }
        }
      } else {
        const codes: Record<string, [string, Zone]> = {
          inbound: ["IN", "inbound"],
          outbound: ["OUT", "outbound"],
          staging: ["STG", "staging"],
          packing: ["PACK", "packing"],
          quality: ["QC", "staging"],
          returns: ["RET", "staging"],
        };
        const entry = codes[m.kind];
        if (entry) {
          const id = `${prefix}${entry[0]}-${pad(m.number)}`;
          locations.push({
            id,
            code: id,
            zone: entry[1],
            label: `${floor.name} · ${m.label}`,
            x: m.x,
            z: m.z,
            y,
            floorId: floor.id,
            moduleId: m.id,
          });
        }
      }
    });
  });
  if (new Set(locations.map((l) => l.id)).size !== locations.length)
    errors.push("Aisle/station numbers must be unique per kind on each floor.");
  for (const zone of Object.keys(centers) as Zone[]) {
    const list = locations.filter(
      (l) => l.zone === zone && l.floorId === design.floors[0].id,
    );
    if (list.length)
      centers[zone] = [
        list.reduce((s, l) => s + l.x, 0) / list.length,
        list.reduce((s, l) => s + l.z, 0) / list.length,
      ];
  }
  const ids = new Set(locations.map((l) => l.id));
  const aliases = c.locationMappings || [],
    rules = c.locationRules || [];
  if (
    new Set(aliases.map((m) => m.externalId.trim().toLowerCase())).size !==
    aliases.length
  )
    errors.push("External location IDs must be unique.");
  if (new Set(rules.map((r) => r.locationId)).size !== rules.length)
    errors.push("Capacity rules must be unique per location.");
  if (c.locationMappings?.some((m) => !ids.has(m.locationId)))
    errors.push("The design removes an externally mapped address.");
  if (
    rules.some((r) =>
      ["inbound", "outbound"].includes(
        locations.find((l) => l.id === r.locationId)?.zone || "",
      ),
    )
  )
    errors.push(
      "Capacity rules require a storage, staging, or packing location.",
    );
  if (c.locationRules?.some((r) => !ids.has(r.locationId)))
    errors.push("The design removes an address with a capacity rule.");
  return {
    locations,
    racks,
    centers,
    capacity: locations.filter((l) => l.zone === "storage").length,
    requiredWidth: c.width,
    requiredDepth: c.depth,
    errors: [...new Set(errors)].slice(0, 60),
  };
}
/** Conservative circular envelope includes every corner at any heading. */
export function robotClearance(m: DesignModule) {
  return mobileRobots.includes(m.kind as EquipmentKind)
    ? Math.hypot(m.width, m.depth) / 2 + 0.15
    : 0.45;
}
export function designWalkable(
  p: DesignPoint,
  floor: DesignFloor,
  ignoreId = "",
  clearance = 0.4,
) {
  if (!pointInside(p, floor.outline)) return false;
  for (let i = 0; i < floor.outline.length; i++) {
    const a = floor.outline[i],
      b = floor.outline[(i + 1) % floor.outline.length],
      dx = b.x - a.x,
      dz = b.z - a.z,
      t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
    if (Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz) < clearance)
      return false;
  }
  for (const m of floor.modules.filter(
    (m) =>
      m.id !== ignoreId &&
      m.kind !== "area" &&
      !mobileRobots.includes(m.kind as EquipmentKind),
  )) {
    const angle = (-m.rotation * Math.PI) / 180,
      dx = p.x - m.x,
      dz = p.z - m.z,
      x = dx * Math.cos(angle) - dz * Math.sin(angle),
      z = dx * Math.sin(angle) + dz * Math.cos(angle);
    if (m.kind === "aisle") {
      if (
        Math.abs(z) < m.bays * 1.2 + clearance &&
        Math.abs(x) > m.aisleWidth / 2 - clearance &&
        Math.abs(x) < m.aisleWidth / 2 + 1.2 + clearance
      )
        return false;
    } else if (
      Math.abs(x) < m.width / 2 + clearance &&
      Math.abs(z) < m.depth / 2 + clearance
    )
      return false;
  }
  return true;
}

/** A converted template must keep its existing presentation until spatial edits require a custom world. */
export function usesTemplateGeometry(c: WarehouseConfig, legacy: Layout) {
  if (!c.design || c.design.floors.length !== 1) return false;
  const expected = designFromLayout({ ...c, design: undefined }, legacy),
    floor = c.design.floors[0],
    base = expected.floors[0];
  if (
    floor.id !== base.id ||
    floor.height !== base.height ||
    JSON.stringify(floor.outline) !== JSON.stringify(base.outline) ||
    floor.modules.length !== base.modules.length
  )
    return false;
  const keys = [
    "kind",
    "x",
    "z",
    "width",
    "depth",
    "height",
    "rotation",
    "number",
    "bays",
    "levels",
    "bins",
    "aisleWidth",
  ] as const;
  return floor.modules.every((m) => {
    const old = base.modules.find((n) => n.id === m.id);
    return old && keys.every((k) => m[k] === old[k]) && m.route.length === 0;
  });
}
