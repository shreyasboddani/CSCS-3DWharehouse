import test from "node:test";
import assert from "node:assert/strict";
import {
  configSchema,
  defaultConfig,
  fitAisleLength,
  arrangeTemplate,
  updateTemplate,
  generateLayout,
  templates,
} from "../src/domain/warehouse.ts";
import {
  containsModule,
  createModule,
  designFromLayout,
  resizeDesign,
  arrangeFloor,
  fitDesignAisle,
  modulesOverlap,
  outlineTemplate,
  moduleSchema,
} from "../src/domain/design.ts";
import { createApplication } from "../server/index.ts";
import { draftInputSchema } from "../src/domain/drafts.ts";
import type { DesignFloor } from "../src/domain/design.ts";
import { feet, meters, squareFeet } from "../src/domain/units.ts";

const large = {
  ...defaultConfig,
  name: "Large warehouse",
  width: 140,
  depth: 140,
  aisles: 15,
  bays: 30,
  inboundDoors: 12,
  outboundDoors: 12,
};

test("larger aisle and dock counts survive validation and generate real addresses", () => {
  const config = configSchema.parse(large);
  const layout = generateLayout(config);
  assert.deepEqual(layout.errors, []);
  assert.ok(layout.locations.some((l) => l.id === "A15-L-B30-L01-01"));
  assert.ok(layout.locations.some((l) => l.id === "IN-12"));
  assert.ok(layout.locations.some((l) => l.id === "OUT-12"));
});

test("unbounded inputs fail physical validation without allocating huge layouts", () => {
  for (const key of ["aisles", "bays", "inboundDoors", "outboundDoors"]) {
    const config = configSchema.parse({ ...large, [key]: 1000000 });
    const layout = generateLayout(config);
    assert.ok(layout.errors.length);
    assert.equal(layout.locations.length, 0);
    assert.equal(designFromLayout(config, layout).floors[0].modules.length, 0);
  }
});

test("long template aisles fit all flow templates without changing address format", () => {
  for (const template of templates) {
    const config = fitAisleLength({
      ...large,
      aisles: 4,
      template: template.id,
    });
    const layout = generateLayout(config);
    assert.ok(config.bays > 20);
    assert.deepEqual(layout.errors, []);
    assert.ok(layout.locations.some((l) => l.id === "A01-L-B01-L01-01"));
    for (const rack of layout.racks)
      assert.ok(Math.abs(rack.z) + rack.length / 2 < config.depth / 2);
  }
});

function floor(shape: "rectangle" | "l-shape" = "rectangle"): DesignFloor {
  return {
    id: "ground",
    name: "Ground floor",
    height: 30,
    outline: outlineTemplate(shape, 120, 120),
    modules: [],
  };
}

test("custom fit works in either orientation and leaves room at the ends", () => {
  for (const rotation of [0, 90] as const) {
    const f = floor();
    const aisle = { ...createModule("aisle", "shelves", 1), rotation };
    f.modules.push(aisle);
    const fitted = fitDesignAisle(f, aisle)!;
    assert.ok(fitted.bays > 20);
    assert.equal(fitted.bays, 49);
    assert.ok(containsModule(f, fitted));
  }
});

test("custom fit stops before equipment and concave building cutouts", () => {
  const f = floor();
  const aisle = createModule("aisle", "shelves", 1);
  const table = createModule("packing", "table", 1, 0, 20);
  f.modules.push(aisle, table);
  const fitted = fitDesignAisle(f, aisle)!;
  assert.ok(containsModule(f, fitted));
  assert.equal(modulesOverlap(fitted, table, 0.5), false);
  assert.equal(
    modulesOverlap({ ...fitted, bays: fitted.bays + 1 }, table, 0.5),
    true,
  );
  const concave = floor("l-shape");
  const inCutout = createModule("aisle", "cutout", 1, 40, 40);
  assert.equal(fitDesignAisle(concave, inCutout), undefined);
});

test("tall roofs persist and floor area is converted rather than relabeled", () => {
  assert.equal(
    configSchema.parse({ ...large, ceilingHeight: 40 }).ceilingHeight,
    40,
  );
  assert.equal(squareFeet(100), (1076).toLocaleString());
  assert.equal(squareFeet(0), "0");
});

test("dimensions, racks and stations are no longer tied to old schema caps", () => {
  const c = configSchema.parse({
    ...large,
    width: 320,
    depth: 200,
    aisles: 30,
    bays: 60,
    levels: 8,
    bins: 4,
    stagingLanes: 20,
    packStations: 20,
    inboundDoors: 20,
    outboundDoors: 20,
    ceilingHeight: 30,
    aisleWidth: 8,
    yardDepth: 60,
  });
  const l = generateLayout(c);
  assert.deepEqual(l.errors, []);
  assert.equal(l.capacity, 115200);
  assert.ok(l.locations.some((p) => p.id === "A30-R-B60-L08-04"));
  assert.ok(Math.abs(feet(meters(1000)) - 1000) < 1e-9);
});

test("250 aisles and 500 docks generate complete template and custom layouts and drafts", () => {
  const c = arrangeTemplate({
    ...defaultConfig,
    name: "250 aisles",
    aisles: 250,
    bays: 10,
    inboundDoors: 250,
    outboundDoors: 250,
    autoFitAisles: false,
  });
  assert.ok(c.width > 140);
  const layout = generateLayout(c);
  assert.deepEqual(layout.errors, []);
  assert.equal(layout.racks.length, 500);
  assert.equal(layout.capacity, 30000);
  for (const id of ["A250-R-B10-L03-02", "IN-250", "OUT-250"]) {
    assert.ok(layout.locations.some((l) => l.id === id), id);
  }
  const design = designFromLayout(c, layout);
  assert.equal(design.floors[0].modules.filter((m) => m.kind === "aisle").length, 250);
  assert.ok(design.floors[0].modules.length > 400);
  draftInputSchema.parse({ config: { ...c, design }, context: { mode: "studio" } });
  moduleSchema.parse({
    ...createModule("aisle", "large-aisle", 500),
    bays: 300, levels: 20, bins: 8, x: 1000, width: 400, height: 70,
  });
  const custom = generateLayout({ ...c, design });
  assert.deepEqual(custom.errors, []);
  assert.equal(custom.racks.length, 500);
  assert.equal(custom.capacity, 30000);
  assert.deepEqual(arrangeFloor(design.floors[0]), design.floors[0]);
  const larger = { width: c.width * 1.2, depth: c.depth * 1.5 };
  const resized = resizeDesign(design, c, larger);
  const arranged = { ...resized, floors: resized.floors.map(arrangeFloor) };
  const expanded = generateLayout({ ...c, ...larger, design: arranged });
  assert.deepEqual(expanded.errors, []);
  assert.equal(arranged.floors[0].modules.length, design.floors[0].modules.length);
  assert.equal(expanded.racks.length, 500);
});

test("automatic arrangement grows the building for every flow and retains counts", () => {
  for (const template of templates) {
    const c = arrangeTemplate({
      ...defaultConfig,
      name: "Auto",
      template: template.id,
      aisles: 24,
      inboundDoors: 18,
      outboundDoors: 19,
      stagingLanes: 20,
      packStations: 21,
      levels: 10,
    });
    assert.deepEqual(generateLayout(c).errors, []);
    assert.equal(c.aisles, 24);
    assert.equal(c.inboundDoors, 18);
    assert.ok(c.ceilingHeight! > 14);
    const expanded = updateTemplate(c, { depth: 200 });
    assert.ok(expanded.bays > c.bays);
    assert.deepEqual(generateLayout(expanded).errors, []);
    const shortened = updateTemplate(expanded, { depth: 60 });
    assert.ok(shortened.bays < expanded.bays);
    assert.deepEqual(generateLayout(shortened).errors, []);
  }
});

test("custom resize retains logical IDs, keeps docks against their walls and stacks floors", () => {
  const c = { ...defaultConfig, name: "Resize" };
  const design = designFromLayout(c, generateLayout(c));
  const next = resizeDesign(design, c, { width: 240, depth: 152 });
  const config = { ...c, width: 240, depth: 152, design: next };
  const layout = generateLayout(config);
  assert.deepEqual(layout.errors, []);
  assert.deepEqual(
    next.floors[0].modules.map((m) => m.id),
    design.floors[0].modules.map((m) => m.id),
  );
  assert.ok(layout.locations.some((l) => l.id === "A01-L-B01-L01-01"));
  assert.ok(
    next.floors[0].modules
      .filter((m) => m.kind === "aisle")
      .every((m) => m.bays === c.bays * 4),
  );
});

test("shape repair relocates out-of-bounds fixtures and dock edges without renumbering", () => {
  const f = floor("l-shape");
  f.modules = [
    createModule("packing", "table-one", 1, 40, 40),
    createModule("inbound", "door-one", 1, 20, 40),
  ];
  const next = arrangeFloor(f);
  assert.ok(next.modules.every((m) => containsModule(next, m)));
  assert.deepEqual(
    next.modules.map((m) => [m.id, m.number]),
    f.modules.map((m) => [m.id, m.number]),
  );
  assert.deepEqual(
    generateLayout({
      ...large,
      width: 120,
      depth: 120,
      design: { version: 1, grid: 0.3048, floors: [next] },
    }).errors,
    [],
  );
});


test("hundreds of aisles persist through authenticated warehouse and draft APIs", async () => {
  const app = createApplication(":memory:");
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  let cookie = "";
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(origin + "/api/v1" + path, {
      method: body ? "POST" : "GET",
      headers: { origin, cookie, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request("/auth/register", {
      name: "Large layout designer", workspace: "Large layout tests",
      email: "large-layout@example.test", password: "large-layout-test-password",
    })).status, 201);
    const c = arrangeTemplate({ ...defaultConfig, name: "250 aisles",
      aisles: 250, bays: 10, inboundDoors: 250, outboundDoors: 250,
      autoFitAisles: false,
    });
    const design = designFromLayout(c, generateLayout(c));
    const config = { ...c, design };
    const created = await request("/warehouses", { config });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const loaded = await request("/warehouses/" + created.body.warehouse.id);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.warehouse.config.aisles, 250);
    const layout = generateLayout(loaded.body.warehouse.config);
    assert.deepEqual(layout.errors, []);
    assert.ok(layout.locations.some((l) => l.id === "A250-R-B10-L03-02"));
    const draft = await request("/drafts", { config, context: { mode: "studio" } });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const resumed = await request("/drafts/" + draft.body.draft.id);
    assert.equal(resumed.status, 200);
    assert.deepEqual(resumed.body.draft.config.design, JSON.parse(JSON.stringify(design)));
  } finally {
    await new Promise<void>((resolve, reject) => app.server.close((error) => error ? reject(error) : resolve()));
    await app.close();
  }
});
