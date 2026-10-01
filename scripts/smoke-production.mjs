import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

// Uses a separate temporary database. Never connects to the developer/customer DB.
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const folder = mkdtempSync(join(tmpdir(), "warehouse-production-smoke-"));
const origin = "https://warehouse.example.test";
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PUBLIC_ORIGIN: origin,
    DB_PATH: join(folder, "warehouse.db"),
    PORT: String(port),
    BIND_HOST: "127.0.0.1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let errors = "";
child.stderr.on("data", (chunk) => {
  errors = (errors + chunk.toString()).slice(-4000);
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error("Production server did not start in time. " + errors)),
      10000,
    );
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Warehouse API listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Production server exited: " + code + " " + errors));
    });
  });
  const base = "http://127.0.0.1:" + port;
  const html = await fetch(base + "/app/warehouses/not-a-real-id");
  assert.equal(html.status, 200);
  assert.match(html.headers.get("Content-Type"), /text\/html/);
  const markup = await html.text();
  assert.match(markup, /id="root"/);
  const script = markup.match(/src="([^"]+\.js)"/)[1];
  const asset = await fetch(base + script);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("Cache-Control"), /immutable/);
  assert.match(
    html.headers.get("Content-Security-Policy"),
    /object-src 'none'/,
  );
  const health = await fetch(base + "/api/v1/health");
  assert.equal(health.status, 200);
  assert.ok(health.headers.get("X-Request-ID"));
  const register = await fetch(base + "/api/v1/auth/register", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Smoke QA",
      workspace: "Temporary QA",
      email: "smoke@example.test",
      password: "temporary-smoke-password",
    }),
  });
  assert.equal(register.status, 201);
  const cookie = register.headers.get("Set-Cookie");
  for (const flag of ["Secure", "HttpOnly", "SameSite=Lax"])
    assert.ok(cookie.includes(flag));
  const list = await fetch(base + "/api/v1/warehouses", {
    headers: { Cookie: cookie.split(";")[0] },
  });
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).warehouses, []);
  const rejected = await fetch(base + "/api/v1/warehouses", {
    method: "POST",
    headers: {
      Cookie: cookie.split(";")[0],
      Origin: "https://untrusted.example.test",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(rejected.status, 403);
  console.log(
    "Production process smoke passed: SPA/assets, database health, secure cookie flags, session and cross-origin rejection. TLS/reverse proxy and container deployment remain unverified.",
  );
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 12000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
  assert.ok(
    resolve(folder).startsWith(
      join(resolve(tmpdir()), "warehouse-production-smoke-"),
    ),
  );
  rmSync(folder, { recursive: true, force: true });
}
