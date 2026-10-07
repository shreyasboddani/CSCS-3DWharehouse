import test from "node:test";
import assert from "node:assert/strict";
import { configSchema, defaultConfig, fitAisleLength, generateLayout, templates } from "../src/domain/warehouse.ts";
import { containsModule, createModule, designFromLayout, fitDesignAisle, modulesOverlap, outlineTemplate } from "../src/domain/design.ts";
import type { DesignFloor } from "../src/domain/design.ts";
import { squareFeet } from "../src/domain/units.ts";

const large = { ...defaultConfig, name: "Large warehouse", width: 140, depth: 140, aisles: 15, bays: 30, inboundDoors: 12, outboundDoors: 12 };

test("larger aisle and dock counts survive validation and generate real addresses", () => {
  const config = configSchema.parse(large);
  const layout = generateLayout(config);
  assert.deepEqual(layout.errors, []);
  assert.ok(layout.locations.some(l => l.id === "A15-L-B30-L01-01"));
  assert.ok(layout.locations.some(l => l.id === "IN-12"));
  assert.ok(layout.locations.some(l => l.id === "OUT-12"));
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
    const config = fitAisleLength({ ...large, aisles: 4, template: template.id });
    const layout = generateLayout(config);
    assert.ok(config.bays > 20);
    assert.deepEqual(layout.errors, []);
    assert.ok(layout.locations.some(l => l.id === "A01-L-B01-L01-01"));
    for (const rack of layout.racks)
      assert.ok(Math.abs(rack.z) + rack.length / 2 < config.depth / 2);
  }
});

function floor(shape: "rectangle" | "l-shape" = "rectangle"): DesignFloor {
  return { id: "ground", name: "Ground floor", height: 30, outline: outlineTemplate(shape, 120, 120), modules: [] };
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
  assert.equal(modulesOverlap({ ...fitted, bays: fitted.bays + 1 }, table, 0.5), true);
  const concave = floor("l-shape");
  const inCutout = createModule("aisle", "cutout", 1, 40, 40);
  assert.equal(fitDesignAisle(concave, inCutout), undefined);
});

test("tall roofs persist and floor area is converted rather than relabeled", () => {
  assert.equal(configSchema.parse({ ...large, ceilingHeight: 40 }).ceilingHeight, 40);
  assert.equal(squareFeet(100), (1076).toLocaleString());
  assert.equal(squareFeet(0), "0");
});
