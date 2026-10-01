import test from "node:test";
import assert from "node:assert/strict";
import {
  exampleWarehouse,
  defaultConfig,
  validateRecordSet,
  generateLayout,
} from "../src/domain/warehouse.ts";
import type { Warehouse } from "../src/domain/warehouse.ts";
import { applyOperation } from "../src/domain/operations.ts";
import { dockPose } from "../src/domain/facility.ts";
import {
  importCsv,
  exportCsv,
  parseCsv,
  sampleCsv,
} from "../src/domain/csv.ts";
function fixture(): Warehouse {
  return {
    id: "test",
    ...exampleWarehouse(),
    version: 1,
    events: [],
    createdAt: "",
    updatedAt: "",
  };
}
test("CSV supports quoted multiline cells, manifests, aliases, and rejects invalid rows", () => {
  const w = fixture();
  w.records[0].notes = 'First line\nSecond, "quoted" line';
  const csv = exportCsv(w.records),
    result = importCsv(csv, w.config);
  assert.deepEqual(result.errors, []);
  assert.equal(result.records[0].notes, w.records[0].notes);
  assert.equal(importCsv(sampleCsv, w.config).records.length, 1);
  const alias = importCsv(sampleCsv.replace("A01-L-B01-L01-01", "ERP-001"), {
    ...w.config,
    locationMappings: [
      { externalId: "ERP-001", locationId: "A01-L-B01-L01-01" },
    ],
  });
  assert.deepEqual(alias.errors, []);
  assert.equal(alias.records[0].locationId, "A01-L-B01-L01-01");
  assert.ok(
    importCsv(sampleCsv.replace(",12,", ",-1,"), w.config).errors.length,
  );
  assert.ok(
    importCsv(sampleCsv.replace("A01-L-B01-L01-01", "missing"), w.config).errors
      .length,
  );
  assert.throws(() => parseCsv('id,"unclosed'));
  assert.throws(() => importCsv("id,quantity\nx,2", w.config));
  const injection = { ...w.records[0], notes: '=HYPERLINK("bad")' };
  assert.ok(exportCsv([injection]).includes("'=HYPERLINK"));
});
test("putaway, pick, pack, load and dispatch conserve stock and preserve batches", () => {
  let w = fixture(),
    seq = 0;
  const next = () => `new-${++seq}`;
  const inbound = w.records.find((r) => r.kind === "Handling unit")!;
  inbound.batch = "LOT-1";
  inbound.quantity = 48;
  const run = (
    type: Parameters<typeof applyOperation>[1]["type"],
    recordId: string,
    quantity?: number,
    locationId?: string,
    reference?: string,
  ) => {
    w = {
      ...w,
      records: applyOperation(
        w,
        { type, recordId, quantity, locationId, reference },
        next,
      ).records,
    };
    assert.equal(validateRecordSet(w.records, w.config), null);
  };
  run("putaway", inbound.id, 20, "A01-L-B01-L01-01");
  assert.equal(w.records.find((r) => r.id === inbound.id)!.quantity, 28);
  assert.equal(w.records.find((r) => r.id === "new-1")!.batch, "LOT-1");
  run("pick", "new-1", 12, "PACK-01", "ORDER-10");
  assert.equal(w.records.find((r) => r.id === "new-1")!.quantity, 8);
  run("pack", "new-2");
  run("hold", "new-2");
  run("release", "new-2");
  assert.equal(w.records.find((r) => r.id === "new-2")!.status, "Ready");
  run("load", "new-2", 12, "OUT-01");
  const truck = w.records.find(
    (r) => r.kind === "Truck" && r.locationId === "OUT-01",
  )!;
  assert.equal(truck.cargo!.at(-1)!.quantity, 12);
  run("hold", "new-3");
  assert.throws(() => run("dispatch", truck.id), /not ready/);
  assert.equal(w.records.find((r) => r.id === truck.id)!.status, "At dock");
  run("release", "new-3");
  run("dispatch", truck.id);
  assert.equal(w.records.find((r) => r.id === "new-3")!.status, "Dispatched");
  assert.throws(() => run("dispatch", truck.id));
  assert.throws(
    () => run("pick", "new-1", 100, "PACK-01", "ORDER-10"),
    /exceeds/,
  );
  assert.equal(
    w.records
      .filter((r) => r.batch === "LOT-1" && r.kind !== "Truck")
      .reduce((sum, r) => sum + r.quantity, 0),
    48,
  );
});
test("inbound manifests create received units once and arrivals respect dock occupancy", () => {
  const w = fixture(),
    truck = w.records.find(
      (r) => r.kind === "Truck" && r.locationId === "IN-01",
    )!;
  truck.cargo = [
    { id: "cargo-1", sku: "SKU-A", quantity: 15 },
    { id: "cargo-2", sku: "SKU-B", quantity: 8 },
  ];
  let seq = 0;
  const received = applyOperation(
    w,
    { type: "receive", recordId: truck.id, locationId: "STG-01" },
    () => `received-${++seq}`,
  );
  assert.equal(
    received.records.find((r) => r.id === truck.id)!.status,
    "Dispatched",
  );
  assert.equal(
    received.records
      .filter((r) => r.id.startsWith("received-"))
      .reduce((n, r) => n + r.quantity, 0),
    23,
  );
  assert.throws(() =>
    applyOperation(
      { ...w, records: received.records },
      { type: "receive", recordId: truck.id, locationId: "STG-01" },
      () => "",
    ),
  );
  const other = { ...truck, id: "other", status: "Expected" as const };
  assert.throws(
    () =>
      applyOperation(
        { ...w, records: [...w.records, other] },
        { type: "arrive", recordId: other.id },
        () => "",
      ),
    /occupied/,
  );
  assert.match(
    validateRecordSet([...w.records, { ...truck, id: "duplicate" }], w.config)!,
    /one docked truck/,
  );
});
test("layout placement preserves IDs and rejects rack overlaps and ceiling violations", () => {
  const c = { ...defaultConfig, name: "Test" };
  const moved = generateLayout({
    ...c,
    layoutOffsets: { storage: { x: 1, z: 0 } },
  });
  assert.deepEqual(moved.errors, []);
  assert.equal(moved.locations[0].id, generateLayout(c).locations[0].id);
  assert.equal(moved.locations[0].x, generateLayout(c).locations[0].x + 1);
  assert.ok(
    generateLayout({ ...c, layoutOffsets: { packing: { x: 0, z: -10 } } })
      .errors.length,
  );
  assert.ok(
    generateLayout({ ...c, levels: 6, ceilingHeight: 6 }).errors.length,
  );
  assert.equal(
    generateLayout({ ...c, template: "l-flow" }).locations.find(
      (l) => l.id === "OUT-01",
    )!.x,
    c.width / 2 - 0.4,
  );
});
test("dock frames and trailers align to every template exterior wall", () => {
  for (const template of ["through", "u-flow", "l-flow"] as const) {
    const c = { ...defaultConfig, template };
    for (const door of generateLayout(c).locations.filter(
      (l) => l.zone === "inbound" || l.zone === "outbound",
    )) {
      const pose = dockPose(door, c),
        rear = {
          x: pose.x + Math.sin(pose.rotation) * -0.07,
          z: pose.z + Math.cos(pose.rotation) * -0.07,
        },
        cab = {
          x: pose.x + Math.sin(pose.rotation) * -7.5,
          z: pose.z + Math.cos(pose.rotation) * -7.5,
        };
      assert.ok(
        Math.abs(Math.abs(rear.x) - c.width / 2) < 0.1 ||
          Math.abs(Math.abs(rear.z) - c.depth / 2) < 0.1,
      );
      assert.ok(Math.abs(cab.x) > c.width / 2 || Math.abs(cab.z) > c.depth / 2);
    }
  }
});
