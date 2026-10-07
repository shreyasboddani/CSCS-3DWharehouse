import { localPoint } from "./design";
import type { DesignFloor } from "./design";

/** Facade spans share the saved dock geometry; openings are not painted onto solid walls. */
export function wallSections(floor: DesignFloor, edge: number, top = floor.height) {
  const a = floor.outline[edge], b = floor.outline[(edge + 1) % floor.outline.length];
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  if (length < 0.001) return [];
  const doors = floor.modules.filter((m) => m.kind === "inbound" || m.kind === "outbound")
    .flatMap((m) => {
      const rear = [-1, 1].map((side) => localPoint(m, side * m.width / 2, -m.depth / 2));
      if (!rear.every((p) => Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / length < 0.001)) return [];
      const positions = rear.map((p) => ((p.x - a.x) * dx + (p.z - a.z) * dz) / length);
      const start = Math.min(...positions), end = Math.max(...positions);
      if (start < -0.001 || end > length + 0.001) return [];
      return [{ start: Math.max(0, start), end: Math.min(length, end), height: Math.min(top, m.height) }];
    });
  const cuts = [...new Set([0, length, ...doors.flatMap((d) => [d.start, d.end])])].sort((x, y) => x - y);
  return cuts.slice(0, -1).flatMap((start, i) => {
    const end = cuts[i + 1];
    const bottom = doors.reduce((h, d) => (start + end) / 2 >= d.start && (start + end) / 2 <= d.end ? Math.max(h, d.height) : h, 0);
    if (top - bottom < 0.001 || end - start < 0.001) return [];
    return [{
      x: a.x + dx * (start + end) / (2 * length),
      z: a.z + dz * (start + end) / (2 * length),
      width: end - start, bottom, height: top - bottom,
      rotation: -Math.atan2(dz, dx),
    }];
  });
}

/** Exact interior spans for roof members over a concave floor, with no cutout bridging. */
export function roofSpans(floor: DesignFloor, z: number) {
  const xs = floor.outline.flatMap((a, i) => {
    const b = floor.outline[(i + 1) % floor.outline.length];
    return (a.z <= z && b.z > z) || (b.z <= z && a.z > z)
      ? [a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z)] : [];
  }).sort((a, b) => a - b);
  return xs.filter((_, i) => i % 2 === 0).map((start, i) => ({ start, end: xs[i * 2 + 1] }));
}
