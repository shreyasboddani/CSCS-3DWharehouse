import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApplication } from "../server/index.ts";

const databaseUrl = process.env.WAREHOUSE_TEST_DATABASE_URL;
test(
  "PostgreSQL shares tenant data across instances and guards simultaneous writes",
  { skip: !databaseUrl },
  async () => {
    // This test creates accounts and facilities. Only an isolated local CI database is accepted.
    const url = new URL(databaseUrl!);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname),
      "Use an isolated local PostgreSQL test database.",
    );
    const apps = [
      createApplication(":memory:", databaseUrl),
      createApplication(":memory:", databaseUrl),
    ];
    const origins: string[] = [];
    try {
      for (const app of apps) {
        await app.ready;
        await new Promise<void>((resolve) =>
          app.server.listen(0, "127.0.0.1", resolve),
        );
        const address = app.server.address();
        assert.ok(address && typeof address !== "string");
        origins.push(`http://127.0.0.1:${address.port}`);
      }
      const request = async (
        index: number,
        path: string,
        method = "GET",
        body?: unknown,
        cookie = "",
      ) => {
        const response = await fetch(origins[index] + "/api/v1" + path, {
          method,
          headers: {
            origin: origins[index],
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
      const register = (index: number) =>
        request(index, "/auth/register", "POST", {
          name: "Postgres QA",
          workspace: "CI database",
          email: randomUUID() + "@example.test",
          password: "isolated-ci-password",
        });
      const a = await register(0),
        b = await register(1);
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      assert.ok(
        (await request(1, "/auth/me", "GET", undefined, a.cookie)).body.user,
      );
      const created = await request(
        0,
        "/warehouses",
        "POST",
        { example: true },
        a.cookie,
      );
      assert.equal(created.status, 201);
      const w = created.body.warehouse;
      assert.equal(
        (await request(1, "/warehouses/" + w.id, "GET", undefined, b.cookie))
          .status,
        404,
      );
      const writes = await Promise.all(
        [0, 1].map((index) =>
          request(
            index,
            "/warehouses/" + w.id,
            "PUT",
            {
              version: 1,
              config: { ...w.config, name: "Concurrent " + index },
            },
            a.cookie,
          ),
        ),
      );
      assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
      const archive = await request(
        1,
        "/warehouses/" + w.id,
        "DELETE",
        { version: 2 },
        a.cookie,
      );
      assert.equal(archive.status, 200);
      const restored = await request(
        0,
        "/warehouses/" + w.id + "/restore",
        "POST",
        { version: 3 },
        a.cookie,
      );
      assert.equal(restored.status, 200);
      assert.equal(restored.body.warehouse.records.length, w.records.length);
      assert.equal(
        (await request(1, "/auth/logout", "POST", {}, a.cookie)).status,
        200,
      );
      assert.equal(
        (await request(0, "/warehouses", "GET", undefined, a.cookie)).status,
        401,
      );
    } finally {
      for (const app of apps) {
        await new Promise<void>((resolve) => app.server.close(() => resolve()));
        await app.close();
      }
    }
  },
);
