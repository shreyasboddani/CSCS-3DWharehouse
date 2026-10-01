import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  exampleWarehouse,
  validateRecordSet,
  validateRecordChange,
  generateLayout,
} from "../src/domain/warehouse.ts";
import type { Warehouse } from "../src/domain/warehouse.ts";
import { applyOperation } from "../src/domain/operations.ts";
import { parseCsv, exportCsv, importCsv } from "../src/domain/csv.ts";
import { operationalSummary } from "../src/domain/summary.ts";
import { runtimeConfig } from "../server/runtime.ts";
import { backupDatabase, restoreDatabase } from "../server/maintenance.ts";
import { createApplication } from "../server/index.ts";

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
test("CSV rejects malformed quoted fields and nondecimal quantities", () => {
  for (const text of [
    'a,b\n"abc"def,x',
    'a,b\n"a""b"x,y',
    'a,b\n"""",x"',
    'a,b\n"unclosed,x',
  ])
    assert.throws(() => parseCsv(text));
  assert.deepEqual(parseCsv('a,b\n"",x\n"a\nb","c,d"'), [
    ["a", "b"],
    ["", "x"],
    ["a\nb", "c,d"],
  ]);
  const w = fixture();
  const csv =
    "id,kind,label,status,locationId,quantity\nx,Inventory,Stock,In storage,A01-L-B01-L01-01,";
  for (const value of ["0x10", "1e2", "-2", "1.5", ""])
    assert.ok(importCsv(csv + value, w.config).errors.length);
  assert.match(
    exportCsv([{ ...w.records[0], notes: "  =SUM(1,2)" }]),
    /'  =SUM/,
  );
});
test("loaded cargo ownership cannot be removed by manual edits, and unloading conserves stock", () => {
  let w = fixture(),
    seq = 0;
  const task = w.records.find((r) => r.kind === "Packing task")!;
  const run = (
    type: Parameters<typeof applyOperation>[1]["type"],
    recordId: string,
    quantity?: number,
    locationId?: string,
    reference?: string,
  ) => {
    const result = applyOperation(
      w,
      { type, recordId, quantity, locationId, reference },
      () => "new-" + ++seq,
    );
    assert.equal(validateRecordSet(result.records, w.config), null);
    w = { ...w, records: result.records };
  };
  run("pack", task.id);
  run("load", task.id, 2, "OUT-01");
  const unit = w.records.find((r) => r.id === "new-1")!;
  const truck = w.records.find((r) => r.id === unit.loadedOnTruckId)!;
  assert.ok(
    validateRecordChange(
      w.records,
      w.records.filter((r) => r.id !== unit.id),
    ),
  );
  assert.ok(
    validateRecordChange(
      w.records,
      w.records.map((r) =>
        r.id === unit.id ? { ...r, loadedOnTruckId: undefined } : r,
      ),
    ),
  );
  assert.ok(
    validateRecordSet(
      w.records.filter((r) => r.id !== truck.id),
      w.config,
    ),
  );
  const before = w.records
    .filter((r) => r.kind !== "Truck")
    .reduce((s, r) => s + r.quantity, 0);
  run("unload", unit.id, 1, "PACK-01");
  assert.equal(w.records.find((r) => r.id === unit.id)!.quantity, 1);
  assert.equal(w.records.find((r) => r.id === truck.id)!.cargo![0].quantity, 1);
  assert.equal(
    w.records.find((r) => r.id === "new-2")!.loadedOnTruckId,
    undefined,
  );
  run("unload", unit.id, 1, "PACK-01");
  assert.equal(
    w.records.find((r) => r.id === unit.id),
    undefined,
  );
  assert.equal(w.records.find((r) => r.id === truck.id)!.cargo!.length, 0);
  assert.equal(
    w.records
      .filter((r) => r.kind !== "Truck")
      .reduce((s, r) => s + r.quantity, 0),
    before,
  );
  assert.throws(() => run("dispatch", truck.id), /manifest/);
});
test("capacity rejects mixed units and overfill; cycle counts accept zero only with a reason", () => {
  const w = fixture(),
    record = w.records[0];
  w.config.locationRules = [
    { locationId: record.locationId, capacity: record.quantity, unit: "units" },
  ];
  assert.equal(validateRecordSet(w.records, w.config), null);
  assert.ok(
    validateRecordSet(
      w.records.map((r) =>
        r.id === record.id ? { ...r, quantity: r.quantity + 1 } : r,
      ),
      w.config,
    ),
  );
  assert.ok(
    validateRecordSet(
      w.records.map((r) =>
        r.id === record.id ? { ...r, unit: "pallets" } : r,
      ),
      w.config,
    ),
  );
  assert.throws(
    () =>
      applyOperation(
        w,
        { type: "count", recordId: record.id, quantity: 0 },
        () => "",
      ),
    /reason/,
  );
  const result = applyOperation(
    w,
    {
      type: "count",
      recordId: record.id,
      quantity: 0,
      reference: "CC-1: empty bin",
    },
    () => "",
  );
  assert.equal(result.records[0].quantity, 0);
  assert.match(result.message, /12 → 0/);
  assert.equal(validateRecordSet(result.records, w.config), null);
  assert.ok(
    generateLayout({
      ...w.config,
      locationRules: [{ locationId: "IN-01", capacity: 1, unit: "units" }],
    }).errors.length,
  );
});
test("operational summary separates units and excludes duplicate truck manifest stock", () => {
  const w = fixture();
  w.records[0].unit = "pallets";
  const summary = operationalSummary(w, Date.parse("2026-10-02T00:00:00Z"));
  assert.equal(
    summary.quantities.find((q) => q.unit === "pallets")!.quantity,
    12,
  );
  assert.equal(
    summary.quantities.reduce((s, q) => s + q.quantity, 0),
    w.records
      .filter((r) => r.kind !== "Truck")
      .reduce((s, r) => s + r.quantity, 0),
  );
  assert.equal(summary.holds, 1);
  assert.equal(
    summary.alerts.filter((a) => a.id.endsWith(":manifest")).length,
    2,
  );
});
test("production startup requires HTTPS and durable storage", () => {
  assert.throws(
    () => runtimeConfig({ NODE_ENV: "production" }),
    /PUBLIC_ORIGIN/,
  );
  assert.throws(
    () =>
      runtimeConfig({
        NODE_ENV: "production",
        PUBLIC_ORIGIN: "http://example.test",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      runtimeConfig({
        NODE_ENV: "production",
        PUBLIC_ORIGIN: "https://example.test",
        DB_PATH: ":memory:",
      }),
    /durable/,
  );
  for (const PUBLIC_ORIGIN of [
    "https://example.test/path",
    "https://example.test/",
    "https://me:pass@example.test",
    "https://example.test?x=1",
  ])
    assert.throws(() => runtimeConfig({ PUBLIC_ORIGIN }));
  assert.throws(() => runtimeConfig({ PORT: "NaN" }), /PORT/);
  assert.equal(
    runtimeConfig({
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://example.test",
      DB_PATH: "/data/warehouse.db",
    }).port,
    4310,
  );
});
test("online backup and restore preserve data and refuse existing destinations", async () => {
  const folder = mkdtempSync(join(tmpdir(), "warehouse-backup-"));
  const source = join(folder, "source.db"),
    target = join(folder, "backup.db"),
    restored = join(folder, "restored.db");
  const app = createApplication(source);
  try {
    const sourceDb = new DatabaseSync(source);
    try {
      sourceDb
        .prepare("INSERT INTO tenants VALUES (?,?)")
        .run("tenant-test", "Backup test workspace");
      sourceDb
        .prepare("INSERT INTO warehouses VALUES (?,?,?,?)")
        .run(
          "facility-test",
          "tenant-test",
          3,
          JSON.stringify({ ...fixture(), id: "facility-test", version: 3 }),
        );
    } finally {
      sourceDb.close();
    }
    await backupDatabase(source, target);
    restoreDatabase(target, restored);
    const db = new DatabaseSync(restored, { readOnly: true });
    try {
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM warehouses").get() as {
            count: number;
          }
        ).count,
        1,
      );
      const warehouse = JSON.parse(
        (
          db
            .prepare("SELECT payload FROM warehouses WHERE id=?")
            .get("facility-test") as { payload: string }
        ).payload,
      ) as Warehouse;
      assert.deepEqual(warehouse.records, fixture().records);
      assert.equal(warehouse.version, 3);
      assert.ok(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='archived_warehouses'",
          )
          .get(),
      );
    } finally {
      db.close();
    }
    await assert.rejects(backupDatabase(source, target), /EEXIST/);
    assert.throws(() => restoreDatabase(target, restored), /EEXIST/);
  } finally {
    app.close();
    assert.ok(
      resolve(folder).startsWith(join(resolve(tmpdir()), "warehouse-backup-")),
    );
    rmSync(folder, { recursive: true, force: true });
  }
});
