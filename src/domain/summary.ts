import { generateLayout } from "./warehouse";
import type { Warehouse } from "./warehouse";

/** Physical quantities exclude truck manifests, which reference the same stock. */
export function operationalSummary(warehouse: Warehouse, now = Date.now()) {
  const layout = generateLayout(warehouse.config);
  const physical = warehouse.records.filter(
    (r) =>
      r.kind !== "Truck" &&
      !["Dispatched", "Expected"].includes(r.status) &&
      r.quantity > 0,
  );
  const byUnit = new Map<string, number>();
  const byLocation = new Map<string, number>();
  for (const record of physical) {
    const unit = record.unit || "units";
    byUnit.set(unit, (byUnit.get(unit) || 0) + record.quantity);
    byLocation.set(
      record.locationId,
      (byLocation.get(record.locationId) || 0) + record.quantity,
    );
  }
  const storageIds = new Set(
    layout.locations.filter((l) => l.zone === "storage").map((l) => l.id),
  );
  const occupied = new Set(
    physical
      .filter((r) => storageIds.has(r.locationId))
      .map((r) => r.locationId),
  ).size;
  const alerts: { id: string; message: string; locationId: string }[] = [];
  for (const record of warehouse.records) {
    if (record.status === "On hold")
      alerts.push({
        id: record.id + ":hold",
        message: record.id + " is on hold",
        locationId: record.locationId,
      });
    if (
      record.kind === "Truck" &&
      record.status === "Expected" &&
      record.scheduledAt &&
      Date.parse(record.scheduledAt) < now
    )
      alerts.push({
        id: record.id + ":late",
        message: record.id + " has an overdue appointment",
        locationId: record.locationId,
      });
    if (
      record.kind === "Truck" &&
      record.status === "At dock" &&
      !record.cargo?.length
    )
      alerts.push({
        id: record.id + ":manifest",
        message: record.id + " needs a cargo manifest",
        locationId: record.locationId,
      });
  }
  const capacities = (warehouse.config.locationRules || []).map((rule) => ({
    ...rule,
    used: byLocation.get(rule.locationId) || 0,
  }));
  for (const rule of capacities.filter((r) => r.used >= r.capacity * 0.9))
    alerts.push({
      id: rule.locationId + ":capacity",
      message:
        rule.locationId +
        " is at " +
        Math.round((rule.used / rule.capacity) * 100) +
        "% capacity",
      locationId: rule.locationId,
    });
  return {
    quantities: [...byUnit].map(([unit, quantity]) => ({ unit, quantity })),
    occupied,
    totalBins: layout.capacity,
    holds: warehouse.records.filter((r) => r.status === "On hold").length,
    readyTasks: warehouse.records.filter(
      (r) => r.kind === "Packing task" && r.status === "Ready",
    ).length,
    expectedTrucks: warehouse.records.filter(
      (r) => r.kind === "Truck" && r.status === "Expected",
    ).length,
    alerts,
    capacities,
  };
}
