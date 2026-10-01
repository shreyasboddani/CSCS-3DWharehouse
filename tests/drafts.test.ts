import test from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../server/index.ts";
import { defaultConfig, generateLayout } from "../src/domain/warehouse.ts";
import {
  designFromLayout,
  usesTemplateGeometry,
} from "../src/domain/design.ts";
test("converted templates retain detailed rendering until geometry changes", () => {
  const c = { ...defaultConfig, name: "Quality" },
    layout = generateLayout(c),
    design = designFromLayout(c, layout);
  assert.equal(usesTemplateGeometry({ ...c, design }, layout), true);
  design.floors[0].modules[0].x += 1;
  assert.equal(usesTemplateGeometry({ ...c, design }, layout), false);
});
test("drafts save unfinished designs, isolate tenants, guard revisions and complete separately", async () => {
  const app = createApplication(":memory:");
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const a = app.server.address();
  assert.ok(a && typeof a !== "string");
  const origin = `http://127.0.0.1:${a.port}`;
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) => {
    const r = await fetch(origin + "/api/v1" + path, {
      method,
      headers: {
        origin,
        cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
    };
  };
  try {
    const login = await request("/auth/register", "POST", {
        name: "Designer",
        workspace: "Draft workspace",
        email: "draft@example.test",
        password: "draft-test-only-password",
      }),
      other = await request("/auth/register", "POST", {
        name: "Other",
        workspace: "Other drafts",
        email: "other-draft@example.test",
        password: "draft-test-only-password",
      });
    assert.equal((await request("/drafts")).status, 401);
    const config = { ...defaultConfig, name: "" },
      design = designFromLayout(config, generateLayout(config));
    design.floors[0].modules[0].x = 69;
    const created = await request(
      "/drafts",
      "POST",
      {
        config: { ...config, design },
        context: {
          mode: "studio",
          floorId: "floor-1",
          outlinePoints: [{ x: 1, z: 2 }],
        },
      },
      login.cookie,
    );
    assert.equal(created.status, 201);
    const d = created.body.draft;
    assert.equal(
      (await request("/drafts/" + d.id, "GET", undefined, other.cookie)).status,
      404,
    );
    assert.equal(
      (await request("/warehouses", "GET", undefined, login.cookie)).body
        .warehouses.length,
      0,
    );
    assert.equal(
      (
        await request(
          "/drafts/" + d.id,
          "PUT",
          { config, version: 99 },
          login.cookie,
        )
      ).status,
      409,
    );
    const changed = await request(
      "/drafts/" + d.id,
      "PUT",
      {
        config: { ...config, design, name: "Resume me" },
        context: d.context,
        version: 1,
      },
      login.cookie,
    );
    assert.equal(changed.status, 200);
    const loaded = await request(
      "/drafts/" + d.id,
      "GET",
      undefined,
      login.cookie,
    );
    assert.equal(loaded.body.draft.config.name, "Resume me");
    assert.deepEqual(loaded.body.draft.context.outlinePoints, [{ x: 1, z: 2 }]);
    assert.equal(
      (await request("/drafts", "GET", undefined, login.cookie)).body.drafts
        .length,
      1,
    );
    assert.equal(
      (
        await request(
          "/drafts/" + d.id + "/complete",
          "POST",
          { version: 2 },
          login.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/drafts", "GET", undefined, login.cookie)).body.drafts
        .length,
      0,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      app.server.close((e) => (e ? reject(e) : resolve())),
    );
    await app.close();
  }
});
