import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { instanceStatic } from "../src/scene/instanceStatic.ts";
import { wallSections, roofSpans } from "../src/domain/architecture.ts";
import { defaultConfig, arrangeTemplate, generateLayout, layoutCapacity, recordSchema } from "../src/domain/warehouse.ts";
import { designFromLayout, outlineTemplate } from "../src/domain/design.ts";
import { exportCsv, importCsv } from "../src/domain/csv.ts";
import { searchRecords } from "../src/domain/search.ts";
import { imageUrlSchema } from "../src/domain/media.ts";
import { createApplication } from "../server/index.ts";

test("5000 industrial parts share geometry and preserve exact per-instance selection", () => {
  const root = new T.Group(), geometry = new T.BoxGeometry(1, 1, 1), material = new T.MeshStandardMaterial();
  for (let i = 0; i < 5000; i++) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(i % 20, Math.floor(i / 400), Math.floor(i / 20) % 20);
    mesh.userData.locationId = "PART-" + i; root.add(mesh);
  }
  instanceStatic(root);
  assert.equal(root.children.length, 1);
  const mesh = root.children[0] as T.InstancedMesh;
  assert.ok(mesh instanceof T.InstancedMesh);
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.count, 5000);
  assert.equal(mesh.userData.instanceIds[4999], "PART-4999");
  const instanceBytes = mesh.instanceMatrix.array.byteLength;
  const expandedBytes = 5000 * geometry.toNonIndexed().getAttribute("position").count * 32;
  assert.ok(instanceBytes < expandedBytes / 10);
  mesh.dispose(); geometry.dispose(); material.dispose();
});

test("structure previews avoid storage-bin allocation and cached layouts invalidate on edits", () => {
  const config = arrangeTemplate({ ...defaultConfig, name: "500 aisles", aisles: 500, bays: 20, autoFitAisles: false });
  const structure = generateLayout(config, "structure");
  assert.equal(structure.racks.length, 1000);
  assert.equal(structure.capacity, 120000);
  assert.equal(layoutCapacity(config), 120000);
  assert.ok(structure.locations.length < 30);
  assert.equal(generateLayout(config, "structure"), structure);
  config.bays = 21;
  assert.equal(generateLayout(config, "structure").capacity, 126000);
  const design = designFromLayout(config, generateLayout(config, "structure"));
  assert.equal(generateLayout({ ...config, design }, "structure").capacity, 126000);
});

test("custom facade panels leave real dock openings and roof members respect concave cutouts", () => {
  const config = { ...defaultConfig, name: "Architecture" };
  const floor = designFromLayout(config, generateLayout(config)).floors[0];
  const panels = floor.outline.flatMap((_, i) => wallSections(floor, i));
  assert.ok(panels.some((p) => p.bottom === 4));
  const concave = { ...floor, outline: outlineTemplate("l-shape", 48, 38), modules: [] };
  const spans = roofSpans(concave, 16);
  assert.equal(spans.length, 1);
  assert.ok(spans[0].end < 24);
});

test("photos round-trip through CSV and multi-word search finds SKU and location", () => {
  const config = { ...defaultConfig, name: "Photo CSV" };
  const record = recordSchema.parse({ id: "INV-PHOTO", kind: "Inventory", label: "Steel bearings", status: "In storage",
    locationId: "A01-L-B01-L01-01", sku: "BEAR-100", quantity: 12, reference: "", destination: "", scheduledAt: "", notes: "",
    source: "Manual", imageUrl: "https://images.example.test/bearing.webp" });
  const imported = importCsv(exportCsv([record]), config);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.records[0].imageUrl, record.imageUrl);
  assert.equal(searchRecords([record], "bear-100 a01").length, 1);
  assert.equal(searchRecords([record], "bear-100", { status: "On hold" }).length, 0);
  for (const bad of ["javascript:alert(1)", "data:image/svg+xml,<svg>", "http://example.test/photo.png", "https://user:password@example.test/photo.png"]) {
    assert.equal(imageUrlSchema.safeParse(bad).success, false);
  }
});

test("uploaded product photos persist separately and remain tenant protected", async () => {
  const app = createApplication(":memory:");
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const address = app.server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = (path: string, body?: unknown, cookie = "") => fetch(origin + "/api/v1" + path, {
    method: body ? "POST" : "GET", headers: { origin, cookie, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    const registered = await request("/auth/register", { name: "Photo designer", workspace: "Photo tests",
      email: "photos@example.test", password: "photo-test-only-password" });
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];
    const created = await request("/warehouses", { config: { ...defaultConfig, name: "Photos" } }, cookie);
    const { warehouse } = await created.json();
    const bytes = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE0cAAAAASUVORK5CYII=";
    const uploaded = await request(`/warehouses/${warehouse.id}/images`, { mime: "image/png", data: bytes }, cookie);
    assert.equal(uploaded.status, 201);
    const { imageUrl } = await uploaded.json();
    const photo = await fetch(origin + imageUrl, { headers: { cookie } });
    assert.equal(photo.status, 200); assert.equal(photo.headers.get("Content-Type"), "image/png");
    assert.equal(Buffer.from(await photo.arrayBuffer()).toString("base64"), bytes);
    assert.equal((await fetch(origin + imageUrl)).status, 401);
    const other = await request("/auth/register", { name: "Other designer", workspace: "Other photos",
      email: "other-photos@example.test", password: "photo-test-only-password" });
    assert.equal((await fetch(origin + imageUrl, { headers: { cookie: other.headers.get("set-cookie")!.split(";")[0] } })).status, 404);
    assert.equal((await request(`/warehouses/${warehouse.id}/images`, { mime: "image/png", data: Buffer.from("not an image file").toString("base64") }, cookie)).status, 422);
    const repeated = await request(`/warehouses/${warehouse.id}/images`, { mime: "image/png", data: bytes }, cookie);
    assert.equal((await repeated.json()).imageUrl, imageUrl);
  } finally { await new Promise<void>((r) => app.server.close(() => r())); await app.close(); }
});
