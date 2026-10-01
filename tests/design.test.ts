import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig,
  recordSchema,
  configSchema,
  generateLayout,
  templates,
  validateRecordSet,
} from "../src/domain/warehouse.ts";
import {
  createModule,
  designFromLayout,
  floorElevation,
  outlineTemplate,
  populateArea,
  distributeModules,
  outlineWithin,
} from "../src/domain/design.ts";
const config = () => ({ ...defaultConfig, name: "Design tests" });

test("upper floor edges cannot bridge even a very narrow concave cutout", () => {
  const outer = [{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:0.01,z:10},{x:0.01,z:0},{x:0,z:0},{x:0,z:10},{x:-10,z:10}];
  const inner = [{x:-5,z:1},{x:5,z:1},{x:5,z:5},{x:-5,z:5}];
  assert.equal(outlineWithin(inner, outer), false);
  assert.equal(outlineWithin([{x:-5,z:-5},{x:5,z:-5},{x:5,z:-1},{x:-5,z:-1}], outer), true);
});
test("custom conversion preserves every canonical address for all templates", () => {
  for (const t of templates) {
    const c = { ...config(), template: t.id },
      before = generateLayout(c),
      design = designFromLayout(c, before),
      after = generateLayout({ ...c, design });
    assert.deepEqual(after.errors, []);
    assert.deepEqual(
      after.locations.map((l) => l.id).sort(),
      before.locations.map((l) => l.id).sort(),
    );
    assert.ok(configSchema.parse({ ...c, design }).design);
  }
});
test("stacked floors have unique addresses and clear-height elevations", () => {
  const c = config(),
    design = designFromLayout(c, generateLayout(c));
  design.floors.push({
    ...design.floors[0],
    id: "mezzanine",
    name: "Mezzanine",
    modules: [{ ...createModule("aisle", "upper-aisle", 1), bays: 3 }],
  });
  const l = generateLayout({ ...c, design });
  assert.deepEqual(l.errors, []);
  assert.equal(floorElevation(design, 1), design.floors[0].height + 0.3);
  assert.ok(
    l.locations.some((p) => p.id.startsWith("mezzanine-A01") && p.y >= 7.8),
  );
  assert.equal(new Set(l.locations.map((p) => p.id)).size, l.locations.length);
});
test("concave shells, collisions, dock alignment and route obstacles are guarded", () => {
  const c = config(),
    design = designFromLayout(c, generateLayout(c)),
    f = design.floors[0];
  f.modules = [];
  f.outline = outlineTemplate("l-shape", c.width, c.depth);
  f.modules = [createModule("packing", "cutout", 1, 4, 4)];
  assert.match(generateLayout({ ...c, design }).errors.join(" "), /outside/);
  f.outline = outlineTemplate("rectangle", c.width, c.depth);
  f.modules = [
    createModule("packing", "p1", 1),
    createModule("packing", "p2", 2),
  ];
  assert.match(generateLayout({ ...c, design }).errors.join(" "), /overlaps/);
  f.modules = [createModule("inbound", "dock", 1)];
  assert.match(generateLayout({ ...c, design }).errors.join(" "), /perimeter/);
  const robot = {
    ...createModule("amr", "robot", 1, -5, 0),
    task: "transport" as const,
    route: [
      { x: -5, z: 0 },
      { x: 5, z: 0 },
    ],
  };
  f.modules = [createModule("packing", "obstacle", 1), robot];
  assert.match(
    generateLayout({ ...c, design }).errors.join(" "),
    /route crosses/,
  );
});
test("area fill and even spacing create deterministic module placements", () => {
  const floor = {
    id: "floor-1",
    name: "Ground",
    height: 7.5,
    outline: outlineTemplate("rectangle", 48, 38),
    modules: [],
  };
  const area = { ...createModule("area", "zone", 1), width: 22, depth: 18 };
  let id = 0;
  const filled = populateArea(
    floor,
    area,
    "aisle",
    createModule("aisle", "prototype", 1),
    () => `rack-${++id}`,
  );
  assert.equal(filled.modules.length, 3);
  const spaced = distributeModules(
    {
      ...floor,
      modules: [
        createModule("packing", "a", 1, -5),
        createModule("packing", "b", 2, 1),
        createModule("packing", "c", 3, 5),
      ],
    },
    ["a", "b", "c"],
    "x",
  );
  assert.deepEqual(
    spaced.modules.map((m) => m.x),
    [-5, 0, 5],
  );
});
test("overlarge designs fail before allocating bins and workflow links cannot dangle", () => {
  const c = config(),
    design = designFromLayout(c, generateLayout(c));
  design.floors[0].modules = Array.from({ length: 30 }, (_, i) => ({
    ...createModule("aisle", `a${i}`, i + 1),
    bays: 20,
    levels: 6,
    bins: 4,
  }));
  const l = generateLayout({ ...c, design });
  assert.equal(l.locations.length, 0);
  assert.match(l.errors[0], /12,000/);
  design.floors[0].modules = [
    { ...createModule("amr", "r", 1), sourceId: "removed" },
  ];
  assert.match(
    generateLayout({ ...c, design }).errors.join(" "),
    /source\/destination/,
  );
});
test("per-aisle capacity applies to records and explicit bin rules override it", () => {
  const c = config(),
    design = designFromLayout(c, generateLayout(c));
  design.floors[0].modules[0].binCapacity = 5;
  const location = generateLayout({ ...c, design }).locations.find(
    (l) => l.moduleId === design.floors[0].modules[0].id,
  )!;
  const r = recordSchema.parse({
    sku: "",
    reference: "",
    destination: "",
    scheduledAt: "",
    notes: "",
    updatedAt: new Date().toISOString(),
    id: "INV-CAP",
    kind: "Inventory" as const,
    label: "Stock",
    locationId: location.id,
    status: "In storage" as const,
    quantity: 6,
    unit: "units",
    source: "Manual" as const,
  });
  assert.match(validateRecordSet([r], { ...c, design }) || "", /capacity/);
  assert.equal(
    validateRecordSet([r], {
      ...c,
      design,
      locationRules: [{ locationId: location.id, capacity: 10, unit: "units" }],
    }),
    null,
  );
});
import { createApplication } from "../server/index.ts";
test("API persists custom floors and rejects edits that orphan inventory", async () => {
  const app = createApplication(":memory:");
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
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
    const login = await request("/auth/register", "POST", {
      name: "Designer",
      workspace: "Design tests",
      email: "designer@example.test",
      password: "local-design-test-pass",
    });
    assert.equal(login.status, 201);
    const c = config(),
      design = designFromLayout(c, generateLayout(c));
    const created = await request(
      "/warehouses",
      "POST",
      { config: { ...c, design } },
      login.cookie,
    );
    assert.equal(created.status, 201);
    const w = created.body.warehouse;
    assert.deepEqual(w.config.design, JSON.parse(JSON.stringify(design)));
    const r = recordSchema.parse({
      sku: "",
      reference: "",
      destination: "",
      scheduledAt: "",
      notes: "",
      updatedAt: new Date().toISOString(),
      id: "INV-PERSIST",
      kind: "Inventory",
      label: "Mapped stock",
      locationId: "A01-L-B01-L01-01",
      status: "In storage",
      quantity: 2,
      source: "Manual",
    });
    const added = await request(
      `/warehouses/${w.id}/records`,
      "POST",
      { version: w.version, record: r },
      login.cookie,
    );
    assert.equal(added.status, 200);
    const emptied = {
      ...design,
      floors: design.floors.map((f) => ({ ...f, modules: [] })),
    };
    const rejected = await request(
      `/warehouses/${w.id}`,
      "PUT",
      {
        version: added.body.warehouse.version,
        config: { ...c, design: emptied },
      },
      login.cookie,
    );
    assert.equal(rejected.status, 422);
    const loaded = await request(
      `/warehouses/${w.id}`,
      "GET",
      undefined,
      login.cookie,
    );
    assert.deepEqual(
      loaded.body.warehouse.config.design,
      JSON.parse(JSON.stringify(design)),
    );
    assert.equal(loaded.body.warehouse.records.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      app.server.close((e) => (e ? reject(e) : resolve())),
    );
    await app.close();
  }
});
