import { z } from "zod";

export const templates = [
  {
    id: "through",
    name: "Through flow",
    description: "Receive at one end. Dispatch at the other.",
    tag: "Linear operations",
  },
  {
    id: "u-flow",
    name: "U-shaped flow",
    description: "Two dock groups. One shared yard.",
    tag: "Shared dock face",
  },
  {
    id: "l-flow",
    name: "L-shaped flow",
    description: "Receiving and dispatch meet at a corner.",
    tag: "Corner operations",
  },
] as const;
export type Zone = "inbound" | "staging" | "storage" | "packing" | "outbound";
export const zones: {
  id: Zone;
  name: string;
  color: string;
  description: string;
}[] = [
  {
    id: "inbound",
    name: "Inbound",
    color: "#3c7be8",
    description: "Appointments, dock doors, and arriving cargo.",
  },
  {
    id: "staging",
    name: "Staging",
    color: "#16a7a0",
    description: "Receiving, scanning, and the next move.",
  },
  {
    id: "storage",
    name: "Storage",
    color: "#6276ba",
    description: "Every aisle, bay, level, and bin.",
  },
  {
    id: "packing",
    name: "Packing",
    color: "#bc9453",
    description: "Stations, orders, and packed units.",
  },
  {
    id: "outbound",
    name: "Outbound",
    color: "#357e83",
    description: "Shipment staging and departing cargo.",
  },
];
export const configSchema = z.object({
  name: z.string().trim().min(2).max(80),
  site: z.string().trim().max(120),
  template: z.enum(["through", "u-flow", "l-flow"]),
  width: z.number().min(24).max(140),
  depth: z.number().min(24).max(140),
  aisles: z.number().int().min(1).max(12),
  bays: z.number().int().min(1).max(20),
  levels: z.number().int().min(1).max(6),
  bins: z.number().int().min(1).max(4),
  aisleWidth: z.number().min(2.4).max(6),
  inboundDoors: z.number().int().min(1).max(8),
  outboundDoors: z.number().int().min(1).max(8),
  stagingLanes: z.number().int().min(1).max(12),
  packStations: z.number().int().min(1).max(12),
  qualityStations: z.number().int().min(0).max(4).optional(),
  returnsLanes: z.number().int().min(0).max(4).optional(),
  ceilingHeight: z.number().min(6).max(18).optional(),
  yardDepth: z.number().min(10).max(30).optional(),
  rackFinish: z.enum(["blue", "graphite", "teal"]).optional(),
  floorFinish: z.enum(["concrete", "polished", "slate"]).optional(),
  layoutOffsets: z
    .object({
      inbound: z
        .object({
          x: z.number().min(-100).max(100),
          z: z.number().min(-100).max(100),
        })
        .optional(),
      staging: z
        .object({
          x: z.number().min(-100).max(100),
          z: z.number().min(-100).max(100),
        })
        .optional(),
      storage: z
        .object({
          x: z.number().min(-100).max(100),
          z: z.number().min(-100).max(100),
        })
        .optional(),
      packing: z
        .object({
          x: z.number().min(-100).max(100),
          z: z.number().min(-100).max(100),
        })
        .optional(),
      outbound: z
        .object({
          x: z.number().min(-100).max(100),
          z: z.number().min(-100).max(100),
        })
        .optional(),
    })
    .optional(),
  locationRules: z
    .array(
      z.object({
        locationId: z.string().min(1).max(64),
        capacity: z.number().int().min(1).max(1000000),
        unit: z.string().trim().min(1).max(20),
      }),
    )
    .max(12000)
    .optional(),
  locationMappings: z
    .array(
      z.object({
        externalId: z.string().trim().min(1).max(100),
        locationId: z.string().min(1).max(64),
      }),
    )
    .max(12000)
    .optional(),
});
export type WarehouseConfig = z.infer<typeof configSchema>;
export const defaultConfig: WarehouseConfig = {
  name: "",
  site: "",
  template: "through",
  width: 48,
  depth: 38,
  aisles: 4,
  bays: 6,
  levels: 3,
  bins: 2,
  aisleWidth: 3.2,
  inboundDoors: 3,
  outboundDoors: 2,
  stagingLanes: 4,
  packStations: 3,
};
export type Location = {
  id: string;
  code: string;
  zone: Zone;
  label: string;
  x: number;
  y: number;
  z: number;
  aisle?: number;
  side?: string;
  bay?: number;
  level?: number;
  bin?: number;
};
export type Rack = {
  x: number;
  z: number;
  length: number;
  height: number;
  aisle: number;
  side: string;
};
export type Layout = {
  locations: Location[];
  racks: Rack[];
  centers: Record<Zone, [number, number]>;
  capacity: number;
  requiredWidth: number;
  requiredDepth: number;
  errors: string[];
};
const pad = (value: number) => String(value).padStart(2, "0");
export function generateLayout(c: WarehouseConfig): Layout {
  const pitch = c.aisleWidth + 2.4;
  const requiredWidth = c.aisles * pitch + (c.template === "l-flow" ? 13 : 7);
  const requiredDepth = c.bays * 2.4 + (c.template === "through" ? 20 : 16);
  const errors: string[] = [];
  if (c.width < requiredWidth)
    errors.push(
      `This rack configuration needs at least ${requiredWidth.toFixed(1)} m of width. Increase the footprint or reduce aisles.`,
    );
  if (c.depth < requiredDepth)
    errors.push(
      `This bay configuration needs at least ${requiredDepth.toFixed(1)} m of depth. Increase the footprint or reduce bays.`,
    );
  const doorSpan = c.template === "u-flow" ? c.width / 2 - 3 : c.width - 6;
  if (c.inboundDoors * 4 > doorSpan)
    errors.push(
      "Inbound doors need more dock frontage. Increase width or reduce the door count.",
    );
  const outboundSpan =
    c.template === "through"
      ? c.width - 6
      : c.template === "u-flow"
        ? c.width / 2 - 3
        : c.depth - 8;
  if (c.outboundDoors * 4 > outboundSpan)
    errors.push(
      "Outbound doors need more dock frontage. Increase the footprint or reduce the door count.",
    );
  const rackCenterZ = c.template === "through" ? 0 : 3;
  const rackCenterX = c.template === "l-flow" ? -5 : 0;
  const front = -c.depth / 2;
  const out: [number, number] =
    c.template === "through"
      ? [0, c.depth / 2 - 3]
      : c.template === "u-flow"
        ? [c.width / 4, front + 2.4]
        : [c.width / 2 - 2.4, 0];
  const pack: [number, number] =
    c.template === "through"
      ? [0, c.depth / 2 - 7]
      : c.template === "u-flow"
        ? [c.width / 4, front + 7]
        : [c.width / 2 - 7, 0];
  const inboundX = c.template === "through" ? 0 : -c.width / 4;
  const centers: Layout["centers"] = {
    inbound: [inboundX, front + 1.8],
    staging: [inboundX, front + 6],
    storage: [rackCenterX, rackCenterZ],
    packing: pack,
    outbound: out,
  };
  const locations: Location[] = [];
  const racks: Rack[] = [];
  for (let a = 1; a <= c.aisles; a++) {
    const centerX = rackCenterX + (a - (c.aisles + 1) / 2) * pitch;
    for (const side of ["L", "R"]) {
      const x = centerX + (side === "L" ? -1 : 1) * (c.aisleWidth / 2 + 0.6);
      racks.push({
        x,
        z: rackCenterZ,
        length: c.bays * 2.4,
        height: c.levels * 1.25 + 0.3,
        aisle: a,
        side,
      });
      for (let b = 1; b <= c.bays; b++)
        for (let l = 1; l <= c.levels; l++)
          for (let bin = 1; bin <= c.bins; bin++) {
            const code = `A${pad(a)}-${side}-B${pad(b)}-L${pad(l)}-${pad(bin)}`;
            locations.push({
              id: code,
              code,
              zone: "storage",
              label: `Aisle ${pad(a)} · ${side === "L" ? "Left" : "Right"} · Bay ${pad(b)} · Level ${l} · Bin ${bin}`,
              x,
              y: (l - 1) * 1.25 + 0.35,
              z:
                rackCenterZ +
                (b - (c.bays + 1) / 2) * 2.4 +
                (bin - (c.bins + 1) / 2) * (2.2 / c.bins),
              aisle: a,
              side,
              bay: b,
              level: l,
              bin,
            });
          }
    }
  }
  for (let i = 1; i <= c.inboundDoors; i++)
    locations.push({
      id: `IN-${pad(i)}`,
      code: `IN-${pad(i)}`,
      zone: "inbound",
      label: `Inbound door ${pad(i)}`,
      x: inboundX + (i - (c.inboundDoors + 1) / 2) * 4,
      y: 0,
      z: front + 0.4,
    });
  for (let i = 1; i <= c.stagingLanes; i++)
    locations.push({
      id: `STG-${pad(i)}`,
      code: `STG-${pad(i)}`,
      zone: "staging",
      label: `Staging lane ${pad(i)}`,
      x: inboundX + (i - (c.stagingLanes + 1) / 2) * 2.2,
      y: 0,
      z: front + 6,
    });
  for (let i = 1; i <= c.packStations; i++)
    locations.push({
      id: `PACK-${pad(i)}`,
      code: `PACK-${pad(i)}`,
      zone: "packing",
      label: `Packing station ${pad(i)}`,
      x:
        pack[0] +
        (c.template === "l-flow" ? 0 : (i - (c.packStations + 1) / 2) * 2.8),
      y: 0,
      z:
        pack[1] +
        (c.template === "l-flow" ? (i - (c.packStations + 1) / 2) * 2.8 : 0),
    });
  for (let i = 1; i <= c.outboundDoors; i++)
    locations.push({
      id: `OUT-${pad(i)}`,
      code: `OUT-${pad(i)}`,
      zone: "outbound",
      label: `Outbound door ${pad(i)}`,
      x:
        (c.template === "l-flow" ? c.width / 2 - 0.4 : out[0]) +
        (c.template === "l-flow" ? 0 : (i - (c.outboundDoors + 1) / 2) * 4),
      y: 0,
      z:
        out[1] +
        (c.template === "l-flow"
          ? (i - (c.outboundDoors + 1) / 2) * 4
          : c.template === "through"
            ? 2.6
            : -2),
    });
  if (c.stagingLanes * 2.2 > doorSpan)
    errors.push(
      "The staging lanes exceed the receiving area. Reduce lanes or increase the footprint.",
    );
  const packSpan =
    c.template === "l-flow"
      ? c.depth - 10
      : c.template === "u-flow"
        ? c.width / 2 - 4
        : c.width - 8;
  if (c.packStations * 2.8 > packSpan)
    errors.push(
      "Packing stations exceed their area. Reduce stations or increase the footprint.",
    );
  for (let i = 1; i <= (c.qualityStations || 0); i++)
    locations.push({
      id: "QC-" + pad(i),
      code: "QC-" + pad(i),
      zone: "staging",
      label: "Quality inspection " + pad(i),
      x: -c.width / 2 + 2.3,
      y: 0,
      z: front + 4 + (i - 1) * 1.8,
    });
  for (let i = 1; i <= (c.returnsLanes || 0); i++)
    locations.push({
      id: "RET-" + pad(i),
      code: "RET-" + pad(i),
      zone: "staging",
      label: "Returns lane " + pad(i),
      x: -c.width / 2 + 4.7,
      y: 0,
      z: front + 4 + (i - 1) * 1.8,
    });
  for (const zone of zones) {
    const offset = c.layoutOffsets?.[zone.id];
    if (!offset) continue;
    if (zone.id === "inbound" && offset.z !== 0)
      errors.push(
        "Inbound doors must stay on the receiving wall. Move them along X only.",
      );
    if (
      zone.id === "outbound" &&
      (c.template === "l-flow" ? offset.x !== 0 : offset.z !== 0)
    )
      errors.push("Outbound doors must stay on their dock wall.");
    centers[zone.id][0] += offset.x;
    centers[zone.id][1] += offset.z;
    for (const l of locations.filter((l) => l.zone === zone.id)) {
      l.x += offset.x;
      l.z += offset.z;
    }
    if (zone.id === "storage")
      for (const rack of racks) {
        rack.x += offset.x;
        rack.z += offset.z;
      }
  }
  const requiredHeight = c.levels * 1.25 + 0.3 + 1.5;
  if (c.ceilingHeight !== undefined && c.ceilingHeight < requiredHeight)
    errors.push(
      "Rack levels need at least " +
        requiredHeight.toFixed(1) +
        " m of ceiling clearance.",
    );
  if (
    racks.some(
      (r) =>
        Math.abs(r.x) + 0.95 > c.width / 2 ||
        Math.abs(r.z) + r.length / 2 + 0.5 > c.depth / 2,
    )
  )
    errors.push(
      "Storage racks extend beyond the building. Move the storage area or expand the footprint.",
    );
  const work = locations.filter(
    (l) => l.zone === "staging" || l.zone === "packing",
  );
  if (
    work.some(
      (l) =>
        Math.abs(l.x) + 1.2 > c.width / 2 || Math.abs(l.z) + 1.2 > c.depth / 2,
    )
  )
    errors.push(
      "A work station extends beyond the building. Move its area inside the footprint.",
    );
  if (
    work.some((l) =>
      racks.some(
        (r) =>
          Math.abs(l.x - r.x) < 1.9 && Math.abs(l.z - r.z) < r.length / 2 + 1.4,
      ),
    )
  )
    errors.push(
      "A work area overlaps rack access space. Move staging or packing away from storage.",
    );
  if (
    locations.some(
      (l) =>
        (l.zone === "inbound" || l.zone === "outbound") &&
        (l.zone === "outbound" && c.template === "l-flow"
          ? Math.abs(l.z) > c.depth / 2 - 1.6
          : Math.abs(l.x) > c.width / 2 - 1.6),
    )
  )
    errors.push(
      "A dock door extends beyond its wall. Adjust its position or door count.",
    );
  const aliases = c.locationMappings || [];
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  if (new Set(aliases.map((a) => a.externalId)).size !== aliases.length)
    errors.push("External location IDs must be unique.");
  if (aliases.some((a) => !locationMap.has(a.locationId)))
    errors.push(
      "An external location mapping references a location removed by this layout.",
    );
  const rules = c.locationRules || [];
  if (new Set(rules.map((r) => r.locationId)).size !== rules.length)
    errors.push("Capacity rules must have unique location IDs.");
  if (
    rules.some(
      (r) =>
        !locationMap.has(r.locationId) ||
        ["inbound", "outbound"].includes(locationMap.get(r.locationId)!.zone),
    )
  )
    errors.push(
      "Capacity rules require an existing storage, staging, or packing location.",
    );
  return {
    locations,
    racks,
    centers,
    capacity: c.aisles * 2 * c.bays * c.levels * c.bins,
    requiredWidth,
    requiredDepth,
    errors,
  };
}
export const kinds = [
  "Inventory",
  "Truck",
  "Handling unit",
  "Packing task",
] as const;
export const statuses = [
  "Expected",
  "At dock",
  "Received",
  "In storage",
  "Packing",
  "Ready",
  "Dispatched",
  "On hold",
] as const;
export const recordSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(kinds),
  label: z.string().trim().min(1).max(100),
  status: z.enum(statuses),
  locationId: z.string().max(64),
  sku: z.string().trim().max(64),
  quantity: z.number().int().min(0).max(1000000),
  reference: z.string().trim().max(80),
  destination: z.string().trim().max(120),
  scheduledAt: z.string().max(32),
  notes: z.string().max(1000),
  source: z.enum(["Manual", "Example", "Imported"]),
  heldFrom: z.enum(statuses).optional(),
  batch: z.string().trim().max(80).optional(),
  unit: z.string().trim().max(20).optional(),
  loadedOnTruckId: z.string().min(1).max(64).optional(),
  cargo: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        sku: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(1).max(1000000),
      }),
    )
    .max(100)
    .optional(),
});
export type OperationalRecord = z.infer<typeof recordSchema>;
export type Activity = {
  id: string;
  at: string;
  action: string;
  entityId: string;
  message: string;
  actor: string;
};
export type Warehouse = {
  id: string;
  config: WarehouseConfig;
  records: OperationalRecord[];
  events: Activity[];
  version: number;
  createdAt: string;
  updatedAt: string;
};
export const allowedStatuses: Record<
  OperationalRecord["kind"],
  OperationalRecord["status"][]
> = {
  Inventory: ["In storage", "On hold", "Ready"],
  Truck: ["Expected", "At dock", "Dispatched", "On hold"],
  "Handling unit": ["Expected", "Received", "Ready", "On hold", "Dispatched"],
  "Packing task": ["Packing", "Ready", "Dispatched", "On hold"],
};
export function validateRecord(
  record: OperationalRecord,
  config: WarehouseConfig,
  locations?: Map<string, Location>,
): string | null {
  const loc = locations
    ? locations.get(record.locationId)
    : generateLayout(config).locations.find((l) => l.id === record.locationId);
  if (!loc) return "Choose a location that exists in this warehouse.";
  if (!allowedStatuses[record.kind].includes(record.status))
    return "This status is not valid for this record type.";
  const validZones = {
    Inventory: ["storage"],
    Truck: ["inbound", "outbound"],
    "Handling unit": ["staging", "storage", "outbound"],
    "Packing task": ["packing"],
  };
  if (!validZones[record.kind].includes(loc.zone))
    return `${record.kind} cannot be assigned to the ${loc.zone} area.`;
  if (
    record.heldFrom !== undefined &&
    (record.status !== "On hold" ||
      !allowedStatuses[record.kind].includes(record.heldFrom) ||
      ["On hold", "Expected", "Dispatched"].includes(record.heldFrom))
  )
    return "Hold history must reference a valid active status for this record type.";
  if (record.cargo?.length && record.kind !== "Truck")
    return "Cargo manifests can only be assigned to trucks.";
  if (
    new Set(record.cargo?.map((item) => item.id)).size !==
    (record.cargo?.length || 0)
  )
    return "Cargo line IDs must be unique within a truck.";
  if (record.scheduledAt && Number.isNaN(Date.parse(record.scheduledAt)))
    return "Enter a valid scheduled date.";
  return null;
}
export function validateRecordSet(
  records: OperationalRecord[],
  config: WarehouseConfig,
): string | null {
  const locations = new Map(
      generateLayout(config).locations.map((l) => [l.id, l]),
    ),
    ids = new Set<string>(),
    docks = new Set<string>(),
    cargoIds = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) return "Record IDs must be unique.";
    ids.add(record.id);
    const issue = validateRecord(record, config, locations);
    if (issue) return record.id + ": " + issue;
    if (
      record.kind === "Truck" &&
      (record.status === "At dock" || record.status === "On hold")
    ) {
      if (docks.has(record.locationId))
        return "Only one docked truck can occupy " + record.locationId + ".";
      docks.add(record.locationId);
      for (const line of record.cargo || []) {
        if (cargoIds.has(line.id))
          return (
            "Cargo " + line.id + " is assigned to more than one docked truck."
          );
        cargoIds.add(line.id);
      }
    }
  }
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const record of records) {
    if (!record.loadedOnTruckId) continue;
    const truck = byId.get(record.loadedOnTruckId);
    const cargo = truck?.cargo?.find((c) => c.id === record.id);
    if (
      record.kind !== "Handling unit" ||
      !truck ||
      truck.kind !== "Truck" ||
      !truck.locationId.startsWith("OUT-") ||
      truck.locationId !== record.locationId ||
      !cargo ||
      cargo.sku !== record.sku ||
      cargo.quantity !== record.quantity
    )
      return (
        record.id + ": loaded stock must match its outbound truck manifest."
      );
    if (
      truck.status === "Dispatched"
        ? record.status !== "Dispatched"
        : !["At dock", "On hold"].includes(truck.status) ||
          !["Ready", "On hold"].includes(record.status)
    )
      return record.id + ": loaded stock and truck lifecycle do not match.";
  }
  const stockByLocation = new Map<
    string,
    { quantity: number; units: Set<string> }
  >();
  for (const r of records) {
    if (
      r.kind === "Truck" ||
      ["Expected", "Dispatched"].includes(r.status) ||
      r.quantity <= 0
    )
      continue;
    const stock = stockByLocation.get(r.locationId) || {
      quantity: 0,
      units: new Set<string>(),
    };
    stock.quantity += r.quantity;
    stock.units.add(r.unit || "units");
    stockByLocation.set(r.locationId, stock);
  }
  for (const rule of config.locationRules || []) {
    const stock = stockByLocation.get(rule.locationId);
    if (stock && [...stock.units].some((unit) => unit !== rule.unit))
      return (
        rule.locationId +
        ": stock units do not match the capacity rule (" +
        rule.unit +
        ")."
      );
    if ((stock?.quantity || 0) > rule.capacity)
      return rule.locationId + ": stock exceeds its configured capacity.";
  }
  return null;
}
/** Manual changes cannot sever cargo ownership. Use the unload operation. */
export function validateRecordChange(
  before: OperationalRecord[],
  after: OperationalRecord[],
): string | null {
  const next = new Map(after.map((r) => [r.id, r]));
  const owners = new Map<string, string>();
  for (const truck of before.filter(
    (r) => r.kind === "Truck" && r.locationId.startsWith("OUT-"),
  ))
    for (const line of truck.cargo || []) owners.set(line.id, truck.id);
  for (const record of before) {
    const linkedTruck = record.loadedOnTruckId || owners.get(record.id);
    if (!linkedTruck) continue;
    const updated = next.get(record.id),
      truck = next.get(linkedTruck);
    const line = truck?.cargo?.find((c) => c.id === record.id);
    if (
      !updated ||
      !truck ||
      !line ||
      updated.loadedOnTruckId !== record.loadedOnTruckId ||
      updated.kind !== record.kind ||
      updated.sku !== record.sku ||
      updated.quantity !== record.quantity ||
      updated.locationId !== record.locationId ||
      updated.status !== record.status ||
      line.sku !== updated.sku ||
      line.quantity !== updated.quantity
    )
      return (
        "Loaded record " +
        record.id +
        " is protected. Use warehouse operations to change or unload cargo."
      );
  }
  return null;
}
export function exampleWarehouse(): {
  config: WarehouseConfig;
  records: OperationalRecord[];
} {
  const config = {
    ...defaultConfig,
    name: "East Distribution Center",
    site: "Atlanta, GA",
    width: 48,
    depth: 38,
  };
  const locations = generateLayout(config).locations;
  const base = {
    sku: "",
    reference: "",
    destination: "",
    scheduledAt: "",
    notes: "",
    source: "Example" as const,
  };
  const records: OperationalRecord[] = locations
    .filter((l) => l.zone === "storage" && l.level === 1)
    .slice(0, 24)
    .map((l, i) => ({
      ...base,
      id: `EX-INV-${pad(i + 1)}`,
      kind: "Inventory",
      label: [
        "Everyday bottle · 600 ml",
        "Insulated bottle · 1 L",
        "Travel tumbler · 350 ml",
      ][i % 3],
      sku: ["BOT-600", "BOT-1000", "TUM-350"][i % 3],
      quantity: 12 + i * 2,
      status: i === 5 ? "On hold" : "In storage",
      locationId: l.id,
    }));
  records.push({
    ...base,
    id: "EX-TRK-01",
    kind: "Truck",
    label: "Inbound trailer 1042",
    status: "At dock",
    locationId: "IN-01",
    reference: "ASN-2048",
    destination: "Receiving",
    notes: "Example appointment. Cargo: 16 pallets of BOT-600.",
    scheduledAt: "2026-10-01T09:00:00Z",
    quantity: 16,
  });
  records.push({
    ...base,
    id: "EX-HU-01",
    kind: "Handling unit",
    label: "Receiving pallet PLT-0801",
    status: "Received",
    locationId: "STG-01",
    sku: "BOT-600",
    quantity: 48,
    destination: "A01-L-B01-L01-01",
    reference: "ASN-2048",
  });
  records.push({
    ...base,
    id: "EX-PACK-01",
    kind: "Packing task",
    label: "Order ORD-3128",
    status: "Packing",
    locationId: "PACK-01",
    sku: "BOT-600",
    quantity: 2,
    destination: "Charleston, SC",
    reference: "ORD-3128",
  });
  records.push({
    ...base,
    id: "EX-TRK-02",
    kind: "Truck",
    label: "Outbound trailer 2086",
    status: "At dock",
    locationId: "OUT-01",
    quantity: 8,
    destination: "Savannah, GA",
    reference: "SHP-1826",
    scheduledAt: "2026-10-01T16:00:00Z",
    notes: "Example load. Eight handling units ready for dispatch.",
  });
  return { config, records };
}
