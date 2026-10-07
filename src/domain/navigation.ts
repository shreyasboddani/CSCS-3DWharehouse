import type { Location, Layout, WarehouseConfig } from "./warehouse";
import { facilityFixtures } from "./facility";
import { designWalkable } from "./design";
export type Point2 = { x: number; z: number };
const workLocations = new WeakMap<Layout, Location[]>();
function workFor(layout: Layout) {
  let locations = workLocations.get(layout);
  if (!locations) {
    locations = layout.locations.filter((l) => l.zone === "packing" || l.zone === "staging");
    workLocations.set(layout, locations);
  }
  return locations;
}
export function isWalkable(
  point: Point2,
  config: WarehouseConfig,
  layout: Layout,
) {
  if (config.design) return designWalkable(point, config.design.floors[0]);
  if (
    Math.abs(point.x) > config.width / 2 - 0.6 ||
    Math.abs(point.z) > config.depth / 2 - 0.6
  )
    return false;
  if (
    layout.racks.some(
      (r) =>
        Math.abs(point.x - r.x) < 0.92 &&
        Math.abs(point.z - r.z) < r.length / 2 + 0.38,
    )
  )
    return false;
  if (
    workFor(layout).some(
      (l) =>
        (l.zone === "packing" &&
          Math.abs(point.x - l.x) < (config.template === "l-flow" ? 2 : 1.3) &&
          Math.abs(point.z - l.z) < (config.template === "l-flow" ? 1.3 : 2)) ||
        (l.zone === "staging" &&
          Math.abs(point.x - l.x) < 0.9 &&
          Math.abs(point.z - l.z) < 1.1),
    )
  )
    return false;
  const fixtures = facilityFixtures(config, layout);
  if (
    Math.abs(point.x - fixtures.scanner.x) < 0.7 &&
    Math.abs(point.z - fixtures.scanner.z) < 1.1
  )
    return false;
  if (
    Math.hypot(point.x - fixtures.forklift.x, point.z - fixtures.forklift.z) <
    1.25
  )
    return false;
  return true;
}
export function nearestWalkable(
  point: Point2,
  config: WarehouseConfig,
  layout: Layout,
): Point2 {
  const p = {
    x: Math.max(-config.width / 2 + 1, Math.min(config.width / 2 - 1, point.x)),
    z: Math.max(-config.depth / 2 + 1, Math.min(config.depth / 2 - 1, point.z)),
  };
  if (isWalkable(p, config, layout)) return p;
  for (
    let radius = 0.5;
    radius < Math.max(config.width, config.depth);
    radius += 0.5
  )
    for (let angle = 0; angle < 16; angle++) {
      const q = {
        x: p.x + Math.cos((angle * Math.PI) / 8) * radius,
        z: p.z + Math.sin((angle * Math.PI) / 8) * radius,
      };
      if (isWalkable(q, config, layout)) return q;
    }
  return { x: 0, z: -config.depth / 2 + 2 };
}
export function findWalkPath(
  from: Point2,
  to: Point2,
  config: WarehouseConfig,
  layout: Layout,
): Point2[] {
  layout = {
    ...layout,
    locations: layout.locations.filter(
      (l) => l.zone === "staging" || l.zone === "packing",
    ),
  };
  const clearSegment = (a: Point2, b: Point2) => {
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1),
    );
    for (let i = 0; i <= steps; i++)
      if (
        !isWalkable(
          {
            x: a.x + ((b.x - a.x) * i) / steps,
            z: a.z + ((b.z - a.z) * i) / steps,
          },
          config,
          layout,
        )
      )
        return false;
    return true;
  };
  const start = nearestWalkable(from, config, layout),
    goal = nearestWalkable(to, config, layout);
  const cell = 0.8,
    cols = Math.floor(config.width / cell) + 1,
    rows = Math.floor(config.depth / cell) + 1;
  const cellOf = (p: Point2) => ({
    x: Math.max(
      0,
      Math.min(cols - 1, Math.round((p.x + config.width / 2) / cell)),
    ),
    z: Math.max(
      0,
      Math.min(rows - 1, Math.round((p.z + config.depth / 2) / cell)),
    ),
  });
  const pointOf = (x: number, z: number) => ({
    x: x * cell - config.width / 2,
    z: z * cell - config.depth / 2,
  });
  const s = cellOf(start),
    g = cellOf(goal),
    key = (x: number, z: number) => z * cols + x;
  const nearestCell = (p: { x: number; z: number }, anchor: Point2) => {
    for (let r = 0; r < 12; r++)
      for (let z = Math.max(0, p.z - r); z <= Math.min(rows - 1, p.z + r); z++)
        for (
          let x = Math.max(0, p.x - r);
          x <= Math.min(cols - 1, p.x + r);
          x++
        )
          if (
            isWalkable(pointOf(x, z), config, layout) &&
            clearSegment(anchor, pointOf(x, z))
          )
            return { x, z };
    return null;
  };
  const sc = nearestCell(s, start),
    gc = nearestCell(g, goal);
  if (!sc || !gc) return [];
  const source = key(sc.x, sc.z),
    target = key(gc.x, gc.z);
  const queue = [source],
    parents = new Map<number, number>([[source, -1]]);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === target) break;
    const x = current % cols,
      z = Math.floor(current / cols);
    for (const [dx, dz] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        k = key(nx, nz);
      if (
        nx < 0 ||
        nz < 0 ||
        nx >= cols ||
        nz >= rows ||
        parents.has(k) ||
        !isWalkable(pointOf(nx, nz), config, layout) ||
        !clearSegment(pointOf(x, z), pointOf(nx, nz))
      )
        continue;
      parents.set(k, current);
      queue.push(k);
    }
  }
  if (!parents.has(target)) return [];
  const reverse: Point2[] = [];
  let cursor = target;
  while (cursor !== -1) {
    reverse.push(pointOf(cursor % cols, Math.floor(cursor / cols)));
    cursor = parents.get(cursor)!;
  }
  const path = reverse.reverse();
  path.unshift(start);
  path.push(goal);
  const simplified = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1],
      b = path[i],
      c = path[i + 1];
    if (Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) > 0.001)
      simplified.push(b);
  }
  simplified.push(goal);
  return simplified;
}
