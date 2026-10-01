import type { Location, WarehouseConfig } from "./warehouse";
import type { Layout } from "./warehouse";
export function facilityFixtures(config: WarehouseConfig, layout: Layout) {
  const [sx, sz] = layout.centers.staging,
    [px, pz] = layout.centers.packing;
  return {
    scanner: {
      x:
        sx + Math.min(config.stagingLanes * 1.1 + 1, config.width / 2 - sx - 2),
      z: sz + 1.4,
    },
    forklift: {
      x:
        config.template === "l-flow"
          ? px - 2
          : px + config.packStations * 1.4 + 2,
      z: pz + 1.5,
    },
  };
}
/** Dock doors lie on the building perimeter; record locations stay on the interior threshold. */
export function dockPose(location: Location, config: WarehouseConfig) {
  const outbound = location.zone === "outbound";
  if (outbound && config.template === "l-flow")
    return { x: config.width / 2, z: location.z, rotation: -Math.PI / 2 };
  if (outbound && config.template === "through")
    return { x: location.x, z: config.depth / 2, rotation: Math.PI };
  return { x: location.x, z: -config.depth / 2, rotation: 0 };
}
