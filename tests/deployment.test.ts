import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createApplication } from "../server/index.ts";
import { runtimeConfig } from "../server/runtime.ts";
import { openDatabase } from "../server/database.ts";
import vercelHandler from "../api/index.ts";

test("Neon runtime requires a valid PostgreSQL URL and Vercel rejects ephemeral storage", () => {
  assert.throws(
    () =>
      runtimeConfig({
        VERCEL: "1",
        NODE_ENV: "production",
        PUBLIC_ORIGIN: "https://warehouse.example.test",
      }),
    /DATABASE_URL/,
  );
  assert.throws(
    () => runtimeConfig({ DATABASE_URL: "https://wrong.example.test" }),
    /PostgreSQL/,
  );
  assert.equal(
    runtimeConfig({
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://warehouse.example.test",
      DATABASE_URL: "postgresql://user:password@localhost/test",
    }).port,
    4310,
  );
});

test("saved accounts, sessions, and warehouses survive application replacement", async () => {
  const directory = mkdtempSync(join(tmpdir(), "warehouse-persistence-"));
  const path = join(directory, "test.db");
  let app = createApplication(path);
  const listen = async () => {
    await new Promise<void>((resolve) =>
      app.server.listen(0, "127.0.0.1", resolve),
    );
    const address = app.server.address();
    assert.ok(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
  };
  const close = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await app.close();
  };
  try {
    let origin = await listen();
    const registration = await fetch(origin + "/api/v1/auth/register", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Persistence QA",
        workspace: "Isolated test",
        email: "persist@example.test",
        password: "isolated-test-password",
      }),
    });
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get("set-cookie")!.split(";")[0];
    const creation = await fetch(origin + "/api/v1/warehouses", {
      method: "POST",
      headers: { origin, cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ example: true }),
    });
    assert.equal(creation.status, 201);
    const saved = (await creation.json()).warehouse;
    await close();
    app = createApplication(path);
    origin = await listen();
    const me = await fetch(origin + "/api/v1/auth/me", { headers: { cookie } });
    assert.equal((await me.json()).user.email, "persist@example.test");
    const list = await fetch(origin + "/api/v1/warehouses", {
      headers: { cookie },
    });
    assert.deepEqual((await list.json()).warehouses[0], saved);
  } finally {
    await close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("database request scopes serialize local transactions and rollbacks preserve data", async () => {
  const db = openDatabase(":memory:");
  try {
    await db.exec("CREATE TABLE test (id TEXT PRIMARY KEY)");
    await Promise.all([
      db.withConnection(async () => {
        await db.exec("BEGIN");
        await db.prepare("INSERT INTO test VALUES (?)").run("rolled-back");
        await db.exec("ROLLBACK");
      }),
      db.withConnection(async () => {
        await db.prepare("INSERT INTO test VALUES (?)").run("saved");
      }),
    ]);
    assert.deepEqual(
      (await db.prepare("SELECT id FROM test").all()).map((row) => row.id),
      ["saved"],
    );
  } finally {
    await db.close();
  }
});

test("Vercel handler fails closed without database settings and routes are separated from SPA", async () => {
  const previous = {
    VERCEL: process.env.VERCEL,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  process.env.VERCEL = "1";
  delete process.env.DATABASE_URL;
  const server = createServer(vercelHandler);
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/index?__route=auth/me`,
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match((await response.json()).error, /configuration/);
    const config = JSON.parse(
      readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
    );
    assert.equal(config.rewrites[0].source, "/api/v1/:path*");
    assert.ok(
      config.rewrites.some(
        (r: { source: string }) => r.source === "/app/:path*",
      ),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
