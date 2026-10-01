import test from "node:test";
import assert from "node:assert/strict";
import {
  configSchema,
  defaultConfig,
  exampleWarehouse,
  generateLayout,
  validateRecord,
  templates,
} from "../src/domain/warehouse.ts";
import { createApplication } from "../server/index.ts";
test("layouts produce unique stable addresses and physical clearance", () => {
  for (const template of templates) {
    const c = {
      ...defaultConfig,
      name: "Test warehouse",
      template: template.id,
    };
    const layout = generateLayout(c);
    assert.deepEqual(layout.errors, []);
    assert.equal(layout.capacity, 288);
    assert.equal(
      new Set(layout.locations.map((l) => l.id)).size,
      layout.locations.length,
    );
    for (const rack of layout.racks) {
      assert.ok(Math.abs(rack.x) + 0.65 < c.width / 2);
      assert.ok(Math.abs(rack.z) + rack.length / 2 < c.depth / 2);
    }
    const larger = generateLayout({
      ...c,
      aisles: 5,
      bays: 7,
      width: 60,
      depth: 48,
    });
    for (const l of layout.locations)
      assert.ok(larger.locations.some((x) => x.id === l.id));
  }
});
test("invalid dimensions and records are guarded", () => {
  assert.equal(
    configSchema.safeParse({ ...defaultConfig, name: "Valid", aisles: 1.5 })
      .success,
    false,
  );
  assert.ok(
    generateLayout({ ...defaultConfig, aisles: 12, width: 24 }).errors.length,
  );
  const seed = exampleWarehouse();
  for (const record of seed.records)
    assert.equal(validateRecord(record, seed.config), null);
  assert.ok(
    validateRecord({ ...seed.records[0], locationId: "IN-01" }, seed.config),
  );
  assert.ok(
    validateRecord({ ...seed.records[0], status: "Dispatched" }, seed.config),
  );
});
test("accounts isolate warehouses, guard versions, and revoke sessions", async () => {
  const app = createApplication(":memory:");
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = "http://127.0.0.1:" + address.port;
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) => {
    const response = await fetch(origin + "/api/v1" + path, {
      method,
      headers: {
        origin,
        cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
      body: await response.json(),
    };
  };
  try {
    assert.equal((await request("/warehouses")).status, 401);
    const a = await request("/auth/register", "POST", {
      name: "Test A",
      workspace: "Workspace A",
      email: "a@example.test",
      password: "test-password-strong",
    });
    const b = await request("/auth/register", "POST", {
      name: "Test B",
      workspace: "Workspace B",
      email: "b@example.test",
      password: "test-password-strong",
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const created = await request(
      "/warehouses",
      "POST",
      { config: { ...defaultConfig, name: "Test facility" } },
      a.cookie,
    );
    assert.equal(created.status, 201);
    const w = created.body.warehouse;
    assert.equal(
      (await request("/warehouses/" + w.id, "GET", undefined, b.cookie)).status,
      404,
    );
    assert.equal(
      (await request("/warehouses", "GET", undefined, b.cookie)).body.warehouses
        .length,
      0,
    );
    const record = { ...exampleWarehouse().records[0], source: "Manual" };
    const added = await request(
      "/warehouses/" + w.id + "/records",
      "POST",
      { version: 1, record },
      a.cookie,
    );
    assert.equal(added.status, 200);
    assert.equal(added.body.warehouse.version, 2);
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/records",
          "POST",
          { version: 1, record },
          a.cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/records",
          "POST",
          {
            version: 2,
            record: { ...record, id: "bad", locationId: "missing" },
          },
          a.cookie,
        )
      ).status,
      422,
    );
    const changed = await request(
      "/warehouses/" + w.id + "/records/" + record.id,
      "PUT",
      { version: 2, record: { ...record, quantity: 44 } },
      a.cookie,
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.body.warehouse.records[0].quantity, 44);
    const removed = await request(
      "/warehouses/" + w.id + "/records/" + record.id,
      "DELETE",
      { version: 3 },
      a.cookie,
    );
    assert.equal(removed.status, 200);
    assert.equal(removed.body.warehouse.records.length, 0);
    assert.equal(removed.body.warehouse.events.length, 4);
    const importPath = "/warehouses/" + w.id + "/import";
    assert.equal(
      (
        await request(
          importPath,
          "POST",
          { version: 4, csv: "id,quantity\nx,2" },
          a.cookie,
        )
      ).status,
      422,
    );
    const validCsv =
      "id,kind,label,status,locationId,quantity,sku\nCSV-1,Inventory,Imported stock,In storage,A01-L-B01-L01-01,10,SKU-1";
    assert.equal(
      (
        await request(
          importPath,
          "POST",
          {
            version: 4,
            csv: validCsv + "\nCSV-2,Inventory,Bad,In storage,missing,2,SKU-2",
          },
          a.cookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (await request("/warehouses/" + w.id, "GET", undefined, a.cookie)).body
        .warehouse.records.length,
      0,
    );
    const imported = await request(
      importPath,
      "POST",
      { version: 4, csv: validCsv },
      a.cookie,
    );
    assert.equal(imported.status, 200);
    assert.equal(imported.body.warehouse.version, 5);
    assert.equal(imported.body.warehouse.records[0].source, "Imported");
    assert.equal(
      (
        await request(
          importPath,
          "POST",
          { version: 4, csv: validCsv },
          a.cookie,
        )
      ).status,
      409,
    );
    const moved = await request(
      "/warehouses/" + w.id + "/operations",
      "POST",
      {
        version: 5,
        operation: {
          type: "pick",
          recordId: "CSV-1",
          quantity: 4,
          locationId: "PACK-01",
          reference: "ORDER-1",
        },
      },
      a.cookie,
    );
    assert.equal(moved.status, 200);
    assert.equal(
      moved.body.warehouse.records.find((r: { id: string }) => r.id === "CSV-1")
        .quantity,
      6,
    );
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "a@example.test",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    const crossOrigin = await fetch(origin + "/api/v1/warehouses", {
      method: "POST",
      headers: {
        origin: "http://attacker.test",
        cookie: a.cookie,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(crossOrigin.status, 403);
    const archived = await request(
      "/warehouses/" + w.id,
      "DELETE",
      { version: 6 },
      a.cookie,
    );
    assert.equal(archived.status, 200);
    assert.equal(
      (await request("/warehouses/" + w.id, "GET", undefined, a.cookie)).status,
      404,
    );
    assert.equal(
      (await request("/warehouses/archived", "GET", undefined, b.cookie)).body
        .warehouses.length,
      0,
    );
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/restore",
          "POST",
          { version: 7 },
          b.cookie,
        )
      ).status,
      404,
    );
    const archiveList = await request(
      "/warehouses/archived",
      "GET",
      undefined,
      a.cookie,
    );
    assert.equal(archiveList.body.warehouses[0].version, 7);
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/restore",
          "POST",
          { version: 6 },
          a.cookie,
        )
      ).status,
      409,
    );
    const restored = await request(
      "/warehouses/" + w.id + "/restore",
      "POST",
      { version: 7 },
      a.cookie,
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.body.warehouse.version, 8);
    assert.equal(restored.body.warehouse.records.length, 2);
    assert.equal(
      restored.body.warehouse.events.at(-1).action,
      "Warehouse restored",
    );
    const capacitySaved = await request(
      "/warehouses/" + w.id,
      "PUT",
      {
        version: 8,
        config: {
          ...restored.body.warehouse.config,
          locationRules: [
            { locationId: "A01-L-B01-L01-01", capacity: 6, unit: "units" },
          ],
        },
      },
      a.cookie,
    );
    assert.equal(capacitySaved.status, 200);
    assert.equal(
      (
        await request(
          importPath,
          "POST",
          { version: 9, csv: validCsv.replace(",10,", ",7,") },
          a.cookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/operations",
          "POST",
          {
            version: 9,
            operation: {
              type: "count",
              recordId: "CSV-1",
              quantity: 0,
              reference: "CC-API: verified empty",
            },
          },
          a.cookie,
        )
      ).status,
      200,
    );
    const packingTask = restored.body.warehouse.records.find(
      (r: { kind: string }) => r.kind === "Packing task",
    );
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/operations",
          "POST",
          {
            version: 10,
            operation: { type: "pack", recordId: packingTask.id },
          },
          a.cookie,
        )
      ).status,
      200,
    );
    const truckRecord = {
      ...record,
      id: "TRUCK-API",
      kind: "Truck",
      locationId: "OUT-01",
      status: "At dock",
      sku: "",
      quantity: 4,
      cargo: [],
    };
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/records",
          "POST",
          { version: 11, record: truckRecord },
          a.cookie,
        )
      ).status,
      200,
    );
    const loaded = await request(
      "/warehouses/" + w.id + "/operations",
      "POST",
      {
        version: 12,
        operation: {
          type: "load",
          recordId: packingTask.id,
          quantity: 4,
          locationId: "OUT-01",
        },
      },
      a.cookie,
    );
    assert.equal(loaded.status, 200);
    const loadedUnit = loaded.body.warehouse.records.find(
      (r: { loadedOnTruckId?: string }) => r.loadedOnTruckId === truckRecord.id,
    );
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/records/" + loadedUnit.id,
          "DELETE",
          { version: 13 },
          a.cookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await request(
          "/warehouses/" + w.id + "/records/" + truckRecord.id,
          "PUT",
          { version: 13, record: truckRecord },
          a.cookie,
        )
      ).status,
      422,
    );
    const unloaded = await request(
      "/warehouses/" + w.id + "/operations",
      "POST",
      {
        version: 13,
        operation: {
          type: "unload",
          recordId: loadedUnit.id,
          quantity: 4,
          locationId: "PACK-01",
        },
      },
      a.cookie,
    );
    assert.equal(unloaded.status, 200);
    assert.equal(
      unloaded.body.warehouse.records.find(
        (r: { id: string }) => r.id === truckRecord.id,
      ).cargo.length,
      0,
    );
    const missingAsset = await fetch(origin + "/assets/missing.js");
    assert.equal(missingAsset.status, 404);
    const malformedPath = await fetch(origin + "/%FF");
    assert.equal(malformedPath.status, 400);
    await request("/auth/logout", "POST", {}, a.cookie);
    assert.equal(
      (await request("/warehouses", "GET", undefined, a.cookie)).status,
      401,
    );
  } finally {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    app.close();
  }
});
