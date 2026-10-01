import { z } from "zod";
import { generateLayout } from "./warehouse";
import type { OperationalRecord, Warehouse } from "./warehouse";
export const operationSchema = z.object({
  type: z.enum([
    "arrive",
    "receive",
    "putaway",
    "transfer",
    "pick",
    "pack",
    "load",
    "unload",
    "count",
    "dispatch",
    "hold",
    "release",
  ]),
  recordId: z.string().min(1).max(64),
  quantity: z.number().int().min(0).max(1000000).optional(),
  locationId: z.string().max(64).optional(),
  reference: z.string().trim().max(80).optional(),
});
export type Operation = z.infer<typeof operationSchema>;
export function applyOperation(
  warehouse: Warehouse,
  operation: Operation,
  createId: () => string,
): { records: OperationalRecord[]; message: string } {
  const records: OperationalRecord[] = warehouse.records.map((r) => ({
    ...r,
    cargo: r.cargo?.map((c) => ({ ...c })),
  }));
  const record = records.find((r) => r.id === operation.recordId);
  if (!record) throw new Error("Record not found.");
  const layout = generateLayout(warehouse.config),
    from = layout.locations.find((l) => l.id === record.locationId)!,
    target = layout.locations.find((l) => l.id === operation.locationId);
  const quantity = operation.quantity ?? record.quantity;
  const active = (r: OperationalRecord) =>
    r.status !== "On hold" &&
    r.status !== "Dispatched" &&
    r.status !== "Expected";
  const fresh = (
    kind: OperationalRecord["kind"],
    status: OperationalRecord["status"],
    locationId: string,
  ): OperationalRecord => ({
    ...record,
    id: createId(),
    kind,
    status,
    locationId,
    quantity,
    reference: operation.reference || record.reference,
    cargo: undefined,
    loadedOnTruckId: undefined,
    source: "Manual",
  });
  const consume = () => {
    record.quantity -= quantity;
    if (record.quantity === 0) records.splice(records.indexOf(record), 1);
  };
  if (operation.type === "count") {
    if (
      record.kind !== "Inventory" ||
      record.status !== "In storage" ||
      operation.quantity === undefined ||
      !operation.reference?.trim()
    )
      throw new Error(
        "Cycle counts require available inventory, a counted quantity, and a reason/reference.",
      );
    const previous = record.quantity;
    record.quantity = quantity;
    return {
      records,
      message:
        "Cycle count · " +
        record.id +
        " · " +
        previous +
        " → " +
        quantity +
        " " +
        (record.unit || "units") +
        " · " +
        operation.reference,
    };
  }
  if (operation.type === "unload") {
    const truck = records.find(
      (r) =>
        r.id === record.loadedOnTruckId ||
        (!record.loadedOnTruckId &&
          r.kind === "Truck" &&
          r.locationId === record.locationId &&
          r.cargo?.some((c) => c.id === record.id)),
    );
    const line = truck?.cargo?.find((c) => c.id === record.id);
    if (
      record.kind !== "Handling unit" ||
      record.status !== "Ready" ||
      !truck ||
      truck.status !== "At dock" ||
      !line ||
      line.quantity !== record.quantity ||
      line.sku !== record.sku
    )
      throw new Error(
        "Unload requires ready linked cargo on a truck at dock. Release any holds first.",
      );
    if (
      !target ||
      target.zone !== "packing" ||
      quantity < 1 ||
      quantity > record.quantity
    )
      throw new Error(
        "Choose a packing station and a quantity within the loaded stock.",
      );
    records.push(fresh("Packing task", "Ready", target.id));
    line.quantity -= quantity;
    consume();
    if (line.quantity === 0)
      truck.cargo = truck.cargo!.filter((c) => c.id !== line.id);
    return {
      records,
      message:
        "Unloaded · " +
        quantity +
        " " +
        (record.unit || "units") +
        " · " +
        record.id +
        " · " +
        truck.id +
        " → " +
        target.code,
    };
  }
  if (operation.type === "arrive") {
    if (record.kind !== "Truck" || record.status !== "Expected")
      throw new Error("Arrival requires an expected truck.");
    if (
      records.some(
        (r) =>
          r.id !== record.id &&
          r.kind === "Truck" &&
          r.locationId === record.locationId &&
          (r.status === "At dock" || r.status === "On hold"),
      )
    )
      throw new Error("This dock is occupied.");
    record.status = "At dock";
    return {
      records,
      message: "Truck arrived · " + record.id + " · " + from.code,
    };
  }
  if (operation.type === "receive") {
    if (
      record.kind !== "Truck" ||
      record.status !== "At dock" ||
      from.zone !== "inbound"
    )
      throw new Error("Receiving requires a truck at an inbound dock.");
    if (!target || target.zone !== "staging")
      throw new Error("Choose a receiving, quality, or returns location.");
    if (!record.cargo?.length)
      throw new Error("Enter the inbound cargo manifest before receiving.");
    for (const line of record.cargo)
      records.push({
        ...record,
        id: createId(),
        kind: "Handling unit",
        status: "Received",
        locationId: target.id,
        sku: line.sku,
        quantity: line.quantity,
        reference: record.reference || record.id,
        cargo: undefined,
        source: "Manual",
        notes: "Received from " + record.id + " · cargo " + line.id,
      });
    record.status = "Dispatched";
    return {
      records,
      message:
        "Received " +
        record.cargo.length +
        " cargo lines · " +
        record.id +
        " → " +
        target.code +
        " · inbound truck departed",
    };
  }
  if (["putaway", "transfer", "pick", "load"].includes(operation.type)) {
    if (!active(record))
      throw new Error(
        "This record is expected, on hold, or already dispatched.",
      );
    if (!record.sku) throw new Error("Assign a SKU before moving stock.");
    if (!target) throw new Error("Choose a destination location.");
    if (quantity > record.quantity)
      throw new Error("The quantity exceeds available stock in this record.");
    if (quantity < 1) throw new Error("There is no stock available to move.");
    if (operation.type === "putaway") {
      if (
        record.kind !== "Handling unit" ||
        record.status !== "Received" ||
        from.zone !== "staging"
      )
        throw new Error(
          "Putaway requires a received handling unit in staging.",
        );
      if (target.zone !== "storage")
        throw new Error("Putaway destination must be a storage bin.");
      consume();
      records.push(fresh("Inventory", "In storage", target.id));
    }
    if (operation.type === "transfer") {
      if (record.kind !== "Inventory" || target.zone !== "storage")
        throw new Error("Transfers move inventory between storage bins.");
      if (target.id === from.id)
        throw new Error("Choose a different storage bin.");
      consume();
      records.push(fresh("Inventory", "In storage", target.id));
    }
    if (operation.type === "pick") {
      if (record.kind !== "Inventory" || target.zone !== "packing")
        throw new Error("Pick inventory to a packing station.");
      if (!operation.reference?.trim())
        throw new Error("An order reference is required for picking.");
      consume();
      records.push(fresh("Packing task", "Packing", target.id));
    }
    if (operation.type === "load") {
      if (
        record.kind !== "Packing task" ||
        record.status !== "Ready" ||
        target.zone !== "outbound"
      )
        throw new Error("Load a ready packing task to an outbound dock.");
      const truck = records.find(
        (r) =>
          r.kind === "Truck" &&
          r.locationId === target.id &&
          r.status === "At dock",
      );
      if (!truck)
        throw new Error("An outbound truck must be at the destination dock.");
      const unit = fresh("Handling unit", "Ready", target.id);
      unit.loadedOnTruckId = truck.id;
      consume();
      records.push(unit);
      truck.cargo = [
        ...(truck.cargo || []),
        { id: unit.id, sku: unit.sku, quantity },
      ];
      if (truck.cargo.length > 100)
        throw new Error("The truck manifest is full.");
    }
    return {
      records,
      message:
        operation.type +
        " · " +
        quantity +
        " " +
        (record.unit || "units") +
        " of " +
        record.sku +
        " · " +
        from.code +
        " → " +
        target.code +
        " · " +
        (operation.reference || record.reference || record.id),
    };
  }
  if (operation.type === "pack") {
    if (record.kind !== "Packing task" || record.status !== "Packing")
      throw new Error("Only an active packing task can be completed.");
    record.status = "Ready";
  }
  if (operation.type === "dispatch") {
    if (
      record.kind !== "Truck" ||
      record.status !== "At dock" ||
      from.zone !== "outbound"
    )
      throw new Error("Only a truck at an outbound dock can be dispatched.");
    if (!record.cargo?.length)
      throw new Error("A cargo manifest is required before dispatch.");
    record.status = "Dispatched";
    for (const unit of records.filter((r) =>
      record.cargo!.some((c) => c.id === r.id),
    )) {
      const line = record.cargo!.find((c) => c.id === unit.id)!;
      if (
        unit.kind !== "Handling unit" ||
        unit.status !== "Ready" ||
        unit.locationId !== record.locationId ||
        unit.sku !== line.sku ||
        unit.quantity !== line.quantity
      )
        throw new Error(
          "A linked cargo record does not match this truck or is not ready. Resolve it before dispatch.",
        );
      unit.status = "Dispatched";
    }
  }
  if (operation.type === "hold") {
    if (!active(record))
      throw new Error("Only an active record can be placed on hold.");
    record.heldFrom = record.status;
    record.status = "On hold";
  }
  if (operation.type === "release") {
    if (record.status !== "On hold")
      throw new Error("This record is not on hold.");
    if (!record.heldFrom || record.heldFrom === "On hold")
      throw new Error(
        "This manually held record has no previous status. Edit it to choose the correct status.",
      );
    record.status = record.heldFrom;
    record.heldFrom = undefined;
  }
  return {
    records,
    message:
      operation.type +
      " · " +
      record.id +
      " · " +
      record.locationId +
      " · " +
      record.status,
  };
}
export function availableOperations(
  record: OperationalRecord,
): Operation["type"][] {
  if (record.status === "On hold") return record.heldFrom ? ["release"] : [];
  if (record.status === "Dispatched") return [];
  if (record.status === "Expected")
    return record.kind === "Truck" ? ["arrive"] : [];
  const actions: Operation["type"][] = ["hold"];
  if (record.kind === "Inventory") {
    if (record.quantity > 0) actions.unshift("transfer", "pick");
    if (record.status === "In storage") actions.push("count");
  }
  if (
    record.kind === "Handling unit" &&
    record.locationId.startsWith("OUT-") &&
    record.status === "Ready" &&
    record.quantity > 0
  )
    actions.unshift("unload");
  if (
    record.kind === "Handling unit" &&
    record.status === "Received" &&
    /^(STG|QC|RET)-/.test(record.locationId) &&
    record.quantity > 0
  )
    actions.unshift("putaway");
  if (record.kind === "Packing task" && record.quantity > 0)
    actions.unshift(record.status === "Packing" ? "pack" : "load");
  if (record.kind === "Truck" && record.locationId.startsWith("OUT-"))
    actions.unshift("dispatch");
  if (record.kind === "Truck" && record.locationId.startsWith("IN-"))
    actions.unshift("receive");
  return actions;
}
