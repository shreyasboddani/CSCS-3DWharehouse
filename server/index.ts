import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { openDatabase } from "./database.ts";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  configSchema,
  generateLayout,
  recordSchema,
  validateRecordSet,
  validateRecordChange,
  validateRecord,
  exampleWarehouse,
} from "../src/domain/warehouse.ts";
import type { Warehouse, Activity } from "../src/domain/warehouse.ts";
import { importCsv } from "../src/domain/csv.ts";
import { applyOperation, operationSchema } from "../src/domain/operations.ts";
import { runtimeConfig } from "./runtime.ts";

const scrypt = promisify(scryptCallback);
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(200)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(128),
});
const registration = credentials.extend({
  name: z.string().trim().min(2).max(80),
  workspace: z.string().trim().min(2).max(80),
});
type User = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  password: string;
  salt: string;
  workspace: string;
};
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  if (!req.headers["content-type"]?.includes("application/json"))
    throw new HttpError(415, "Use JSON for this request.");
  const parsedBody = (req as IncomingMessage & { body?: unknown }).body;
  if (parsedBody !== undefined) {
    const serialized =
      typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody);
    if (Buffer.byteLength(serialized) > 1048576)
      throw new HttpError(413, "Request is too large.");
    try {
      return typeof parsedBody === "string"
        ? JSON.parse(parsedBody)
        : parsedBody;
    } catch {
      throw new HttpError(400, "Invalid JSON.");
    }
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 1048576) throw new HttpError(413, "Request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function createApplication(
  databasePath = process.env.DB_PATH || "./var/warehouse.db",
  connectionString = process.env.DATABASE_URL,
) {
  if (process.env.VERCEL && !process.env.DATABASE_URL)
    throw new Error("Vercel requires a managed DATABASE_URL.");
  const db = openDatabase(databasePath, connectionString);
  const ready = db.exec(`
    ${db.remote ? "BEGIN; SELECT pg_advisory_xact_lock(748201);" : "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"}
    CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS warehouses (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), version INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS warehouse_tenant ON warehouses(tenant_id);
    CREATE TABLE IF NOT EXISTS archived_warehouses (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), version INTEGER NOT NULL, payload TEXT NOT NULL, archived_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS archived_warehouse_tenant ON archived_warehouses(tenant_id);
    CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_attempt_expiry ON auth_attempts(reset);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
    ${db.remote ? "COMMIT;" : ""}
  `);
  void ready.catch(() => undefined);
  let passwordJobs = 0;
  async function derivePassword(password: string, salt: string) {
    if (passwordJobs >= 8)
      throw new HttpError(503, "Sign-in is busy. Try again shortly.");
    passwordJobs += 1;
    try {
      return (await scrypt(password, salt, 64)) as Buffer;
    } finally {
      passwordJobs -= 1;
    }
  }
  async function limit(key: string, maximum: number) {
    const now = Date.now();
    await db.prepare("DELETE FROM auth_attempts WHERE reset<?").run(now);
    const result = await db
      .prepare(
        `INSERT INTO auth_attempts (key,count,reset) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=auth_attempts.count+1 RETURNING count`,
      )
      .get(hash(key), now + 900000);
    if (Number(result?.count) > maximum)
      throw new HttpError(
        429,
        "Too many attempts. Try again in a few minutes.",
      );
  }
  async function userFor(req: IncomingMessage): Promise<User | undefined> {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("wt_session="))
      ?.slice(11);
    if (!cookie) return undefined;
    return (await db
      .prepare(
        "SELECT u.*, t.name AS workspace FROM sessions s JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=u.tenant_id WHERE s.token=? AND s.expires>?",
      )
      .get(hash(cookie), Date.now())) as User | undefined;
  }
  function publicUser(u: User) {
    return { id: u.id, name: u.name, email: u.email, workspace: u.workspace };
  }
  async function establishSession(res: ServerResponse, userId: string) {
    const token = randomBytes(32).toString("hex");
    await db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    await db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(hash(token), userId, Date.now() + 604800000);
    res.setHeader(
      "Set-Cookie",
      `wt_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
  }
  function event(
    user: User,
    entityId: string,
    action: string,
    message: string,
  ): Activity {
    return {
      id: randomUUID(),
      at: new Date().toISOString(),
      entityId,
      action,
      message,
      actor: user.name,
    };
  }
  async function getWarehouse(id: string, user: User): Promise<Warehouse> {
    const row = (await db
      .prepare("SELECT payload FROM warehouses WHERE id=? AND tenant_id=?")
      .get(id, user.tenant_id)) as { payload: string } | undefined;
    if (!row) throw new HttpError(404, "Warehouse not found.");
    return JSON.parse(row.payload);
  }
  async function saveWarehouse(
    w: Warehouse,
    user: User,
    expectedVersion: number,
  ) {
    const issue = validateRecordSet(w.records, w.config);
    if (issue) throw new HttpError(422, issue);
    const updated = {
      ...w,
      version: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
      events: w.events.slice(-2000),
    };
    const result = await db
      .prepare(
        "UPDATE warehouses SET payload=?,version=? WHERE id=? AND tenant_id=? AND version=?",
      )
      .run(
        JSON.stringify(updated),
        updated.version,
        w.id,
        user.tenant_id,
        expectedVersion,
      );
    if (!result.changes)
      throw new HttpError(
        409,
        "This warehouse changed in another session. Reload before saving.",
      );
    return updated;
  }
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    let pathname = "";
    const method = req.method || "GET";
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Request-ID", randomUUID());
    function json(value: unknown, status = 200) {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    }
    try {
      await ready;
      try {
        pathname = new URL(req.url || "/", "http://localhost").pathname;
        decodeURIComponent(pathname);
      } catch {
        throw new HttpError(400, "Invalid request path.");
      }
      if (pathname.startsWith("/api/"))
        res.setHeader("Cache-Control", "no-store");
      if (!["GET", "HEAD"].includes(method)) {
        const origin = req.headers.origin;
        const expected =
          (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.PUBLIC_ORIGIN) || `http://${req.headers.host}`;
        if (!origin || origin !== expected)
          throw new HttpError(403, "Request origin is not allowed.");
      }
      if (pathname === "/api/v1/health" && method === "GET") {
        await db.prepare("SELECT 1").get();
        json({ ok: true });
        return;
      }
      if (pathname === "/api/v1/auth/me" && method === "GET") {
        const u = await userFor(req);
        json({ user: u ? publicUser(u) : null });
        return;
      }
      if (
        ["/api/v1/auth/register", "/api/v1/auth/login"].includes(pathname) &&
        method === "POST"
      ) {
        const ip = process.env.VERCEL
          ? String(req.headers["x-forwarded-for"] || "unknown")
              .split(",")[0]
              .trim()
          : req.socket.remoteAddress || "unknown";
        await limit("ip:" + ip, 120);
        const body = await readBody(req);
        const identity = credentials.parse(body);
        await limit("account:" + hash(identity.email), 15);
        if (pathname.endsWith("register")) {
          const data = registration.parse(body);
          if (
            await db
              .prepare("SELECT id FROM users WHERE email=?")
              .get(data.email)
          )
            throw new HttpError(
              409,
              "An account with this email already exists.",
            );
          const salt = randomBytes(16).toString("hex");
          const password = (await derivePassword(data.password, salt)).toString(
            "hex",
          );
          const id = randomUUID();
          const tenantId = randomUUID();
          if (
            await db
              .prepare("SELECT id FROM users WHERE email=?")
              .get(data.email)
          )
            throw new HttpError(
              409,
              "An account with this email already exists.",
            );
          await db.exec("BEGIN");
          try {
            await db
              .prepare("INSERT INTO tenants VALUES (?,?)")
              .run(tenantId, data.workspace);
            await db
              .prepare("INSERT INTO users VALUES (?,?,?,?,?,?)")
              .run(id, tenantId, data.name, data.email, password, salt);
            await db.exec("COMMIT");
          } catch (e) {
            await db.exec("ROLLBACK");
            throw e;
          }
          await establishSession(res, id);
          json(
            {
              user: {
                id,
                name: data.name,
                email: data.email,
                workspace: data.workspace,
              },
            },
            201,
          );
        } else {
          const data = credentials.parse(body);
          const user = (await db
            .prepare(
              "SELECT u.*,t.name AS workspace FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE email=?",
            )
            .get(data.email)) as User | undefined;
          const derived = (await derivePassword(
            data.password,
            user?.salt || "missing-account-salt",
          )) as Buffer;
          if (
            !user ||
            !timingSafeEqual(Buffer.from(user.password, "hex"), derived)
          )
            throw new HttpError(401, "Email or password is incorrect.");
          await establishSession(res, user.id);
          json({ user: publicUser(user) });
        }
        return;
      }
      if (pathname.startsWith("/api/")) {
        const user = await userFor(req);
        if (!user) throw new HttpError(401, "Sign in to continue.");
        if (pathname === "/api/v1/auth/logout" && method === "POST") {
          const token = req.headers.cookie
            ?.split(";")
            .map((s) => s.trim())
            .find((s) => s.startsWith("wt_session="))
            ?.slice(11);
          if (token)
            await db
              .prepare("DELETE FROM sessions WHERE token=?")
              .run(hash(token));
          res.setHeader(
            "Set-Cookie",
            "wt_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
          );
          json({ ok: true });
          return;
        }
        if (pathname === "/api/v1/warehouses/archived" && method === "GET") {
          const rows = (await db
            .prepare(
              "SELECT id,version,payload,archived_at FROM archived_warehouses WHERE tenant_id=? ORDER BY archived_at DESC",
            )
            .all(user.tenant_id)) as {
            id: string;
            version: number;
            payload: string;
            archived_at: string;
          }[];
          json({
            warehouses: rows.map((r) => ({
              id: r.id,
              version: r.version,
              name: (JSON.parse(r.payload) as Warehouse).config.name,
              archivedAt: r.archived_at,
            })),
          });
          return;
        }
        const restoreMatch = pathname.match(
          /^\/api\/v1\/warehouses\/([a-zA-Z0-9-]+)\/restore$/,
        );
        if (restoreMatch && method === "POST") {
          const body = z
            .object({ version: z.number().int().min(1) })
            .parse(await readBody(req));
          const row = (await db
            .prepare(
              "SELECT payload,version FROM archived_warehouses WHERE id=? AND tenant_id=?",
            )
            .get(restoreMatch[1], user.tenant_id)) as
            | { payload: string; version: number }
            | undefined;
          if (!row) throw new HttpError(404, "Archived warehouse not found.");
          if (body.version !== row.version)
            throw new HttpError(
              409,
              "Archived warehouse changed. Reload before restoring.",
            );
          const warehouse = JSON.parse(row.payload) as Warehouse;
          warehouse.version += 1;
          warehouse.updatedAt = new Date().toISOString();
          warehouse.events = [
            ...warehouse.events,
            event(
              user,
              warehouse.id,
              "Warehouse restored",
              "Restored the warehouse and its operational records.",
            ),
          ].slice(-2000);
          await db.exec("BEGIN");
          try {
            await db
              .prepare("INSERT INTO warehouses VALUES (?,?,?,?)")
              .run(
                warehouse.id,
                user.tenant_id,
                warehouse.version,
                JSON.stringify(warehouse),
              );
            await db
              .prepare(
                "DELETE FROM archived_warehouses WHERE id=? AND tenant_id=?",
              )
              .run(warehouse.id, user.tenant_id);
            await db.exec("COMMIT");
          } catch (e) {
            await db.exec("ROLLBACK");
            throw e;
          }
          json({ warehouse });
          return;
        }
        if (pathname === "/api/v1/warehouses" && method === "GET") {
          const rows = (await db
            .prepare(
              "SELECT payload FROM warehouses WHERE tenant_id=? ORDER BY id DESC",
            )
            .all(user.tenant_id)) as { payload: string }[];
          json({ warehouses: rows.map((r) => JSON.parse(r.payload)) });
          return;
        }
        if (pathname === "/api/v1/warehouses" && method === "POST") {
          const body = z
            .object({
              config: configSchema.optional(),
              example: z.boolean().optional(),
            })
            .parse(await readBody(req));
          const seed = body.example
            ? exampleWarehouse()
            : { config: configSchema.parse(body.config), records: [] };
          const layout = generateLayout(seed.config);
          if (layout.errors.length) throw new HttpError(422, layout.errors[0]);
          const id = randomUUID();
          const at = new Date().toISOString();
          const w: Warehouse = {
            id,
            config: seed.config,
            records: seed.records,
            events: [
              event(
                user,
                id,
                "Created",
                body.example
                  ? "Created an example warehouse with clearly labeled example records."
                  : "Mapped a new warehouse.",
              ),
            ],
            version: 1,
            createdAt: at,
            updatedAt: at,
          };
          await db
            .prepare("INSERT INTO warehouses VALUES (?,?,?,?)")
            .run(id, user.tenant_id, 1, JSON.stringify(w));
          json({ warehouse: w }, 201);
          return;
        }
        const actionMatch = pathname.match(
          /^\/api\/v1\/warehouses\/([a-zA-Z0-9-]+)\/(import|operations)$/,
        );
        if (actionMatch && method === "POST") {
          const warehouse = await getWarehouse(actionMatch[1], user);
          const body = z
            .object({
              version: z.number().int().min(1),
              csv: z.string().max(1000000).optional(),
              operation: operationSchema.optional(),
            })
            .parse(await readBody(req));
          if (body.version !== warehouse.version)
            throw new HttpError(
              409,
              "This warehouse changed. Reload before saving.",
            );
          if (actionMatch[2] === "import") {
            if (!body.csv) throw new HttpError(422, "Choose a CSV file.");
            let result;
            try {
              result = importCsv(body.csv, warehouse.config);
            } catch (error) {
              throw new HttpError(
                422,
                error instanceof Error ? error.message : "Invalid CSV.",
              );
            }
            if (result.errors.length)
              throw new HttpError(422, result.errors.slice(0, 5).join(" "));
            const map = new Map(warehouse.records.map((r) => [r.id, r]));
            for (const record of result.records) map.set(record.id, record);
            if (map.size > 10000)
              throw new HttpError(
                422,
                "This import would exceed the warehouse record limit.",
              );
            const changesIssue = validateRecordChange(warehouse.records, [
              ...map.values(),
            ]);
            if (changesIssue) throw new HttpError(422, changesIssue);
            warehouse.records = [...map.values()];
            warehouse.events.push(
              event(
                user,
                warehouse.id,
                "CSV imported",
                "Imported " +
                  result.records.length +
                  " records. Existing IDs were updated.",
              ),
            );
          } else {
            const operation = operationSchema.parse(body.operation);
            let result;
            try {
              result = applyOperation(warehouse, operation, () => randomUUID());
            } catch (error) {
              throw new HttpError(
                422,
                error instanceof Error
                  ? error.message
                  : "Operation could not be completed.",
              );
            }
            if (result.records.length > 10000)
              throw new HttpError(422, "Warehouse record limit reached.");
            warehouse.records = result.records;
            warehouse.events.push(
              event(
                user,
                operation.recordId,
                "Operation: " + operation.type,
                result.message,
              ),
            );
          }
          const setIssue = validateRecordSet(
            warehouse.records,
            warehouse.config,
          );
          if (setIssue) throw new HttpError(422, setIssue);
          json({
            warehouse: await saveWarehouse(warehouse, user, body.version),
          });
          return;
        }
        const match = pathname.match(
          /^\/api\/v1\/warehouses\/([a-zA-Z0-9-]+)(?:\/records(?:\/([^/]+))?)?$/,
        );
        if (match) {
          const w = await getWarehouse(match[1], user);
          const previousRecords = [...w.records];
          if (method === "GET") {
            json({ warehouse: w });
            return;
          }
          const body = z
            .object({
              version: z.number().int().min(1),
              config: configSchema.optional(),
              record: recordSchema.optional(),
            })
            .parse(await readBody(req));
          if (body.version !== w.version)
            throw new HttpError(
              409,
              "This warehouse changed in another session. Reload before saving.",
            );
          if (!pathname.includes("/records") && method === "PUT") {
            const config = configSchema.parse(body.config);
            const layout = generateLayout(config);
            if (layout.errors.length)
              throw new HttpError(422, layout.errors[0]);
            const configIssue = validateRecordSet(w.records, config);
            if (configIssue) throw new HttpError(422, configIssue);
            w.config = config;
            w.events.push(
              event(
                user,
                w.id,
                "Layout updated",
                "Updated warehouse configuration.",
              ),
            );
          } else if (!pathname.includes("/records") && method === "DELETE") {
            const archivedAt = new Date().toISOString();
            w.version += 1;
            w.updatedAt = archivedAt;
            w.events = [
              ...w.events,
              event(
                user,
                w.id,
                "Warehouse archived",
                "Archived the warehouse. It can be restored from the dashboard.",
              ),
            ].slice(-2000);
            await db.exec("BEGIN");
            try {
              await db
                .prepare("INSERT INTO archived_warehouses VALUES (?,?,?,?,?)")
                .run(
                  w.id,
                  user.tenant_id,
                  w.version,
                  JSON.stringify(w),
                  archivedAt,
                );
              const result = await db
                .prepare(
                  "DELETE FROM warehouses WHERE id=? AND tenant_id=? AND version=?",
                )
                .run(w.id, user.tenant_id, body.version);
              if (!result.changes)
                throw new HttpError(
                  409,
                  "Warehouse changed. Reload and try again.",
                );
              await db.exec("COMMIT");
            } catch (e) {
              await db.exec("ROLLBACK");
              throw e;
            }
            json({ ok: true });
            return;
          } else if (
            pathname.includes("/records") &&
            method === "POST" &&
            !match[2]
          ) {
            const record = recordSchema.parse(body.record);
            const issue = validateRecord(record, w.config);
            if (issue) throw new HttpError(422, issue);
            if (w.records.length >= 10000)
              throw new HttpError(
                422,
                "This warehouse has reached its record limit.",
              );
            if (w.records.some((r) => r.id === record.id))
              throw new HttpError(409, "This record ID already exists.");
            w.records.push({ ...record, source: "Manual" });
            w.events.push(
              event(
                user,
                record.id,
                "Record added",
                `${record.kind}: ${record.label}`,
              ),
            );
          } else if (method === "PUT" && match[2]) {
            const record = recordSchema.parse(body.record);
            if (record.id !== decodeURIComponent(match[2]))
              throw new HttpError(422, "Record IDs cannot change.");
            const index = w.records.findIndex((r) => r.id === record.id);
            if (index < 0) throw new HttpError(404, "Record not found.");
            const issue = validateRecord(record, w.config);
            if (issue) throw new HttpError(422, issue);
            w.records[index] = { ...record, source: "Manual" };
            w.events.push(
              event(
                user,
                record.id,
                "Record updated",
                `${record.label} · ${record.status} · ${record.locationId}`,
              ),
            );
          } else if (method === "DELETE" && match[2]) {
            const id = decodeURIComponent(match[2]);
            const record = w.records.find((r) => r.id === id);
            if (!record) throw new HttpError(404, "Record not found.");
            w.records = w.records.filter((r) => r.id !== id);
            w.events.push(event(user, id, "Record removed", record.label));
          } else throw new HttpError(405, "Method not allowed.");
          const changeIssue = validateRecordChange(previousRecords, w.records);
          if (changeIssue) throw new HttpError(422, changeIssue);
          json({ warehouse: await saveWarehouse(w, user, body.version) });
          return;
        }
        throw new HttpError(404, "Endpoint not found.");
      }
      if (!["GET", "HEAD"].includes(method))
        throw new HttpError(405, "Method not allowed.");
      const root = resolve("dist");
      const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
      let file = resolve(root, relative || "index.html");
      if (
        !file.startsWith(root + "/") &&
        !file.startsWith(root + "\\") &&
        file !== root
      )
        throw new HttpError(403, "Invalid path.");
      if (
        (!existsSync(file) || !statSync(file).isFile()) &&
        (extname(relative) || relative.startsWith("assets/"))
      )
        throw new HttpError(404, "Asset not found.");
      if (!existsSync(file) || !statSync(file).isFile())
        file = resolve(root, "index.html");
      if (!existsSync(file)) {
        res.writeHead(404);
        res.end("Build the frontend or start npm run dev.");
        return;
      }
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
      };
      res.setHeader(
        "Content-Type",
        mime[extname(file)] || "application/octet-stream",
      );
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      );
      res.setHeader(
        "Cache-Control",
        relative.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      res.end(method === "HEAD" ? undefined : readFileSync(file));
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof z.ZodError) {
        json({ error: error.issues[0]?.message || "Invalid input." }, 422);
      } else if (error instanceof HttpError)
        json({ error: error.message }, error.status);
      else if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      )
        json(
          {
            error:
              "This account or warehouse already exists. Reload and try again.",
          },
          409,
        );
      else {
        console.error(error);
        json({ error: "Something went wrong. Please try again." }, 500);
      }
    }
  };
  const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await ready;
      await db.withConnection(() => handler(req, res));
    } catch {
      if (!res.headersSent) {
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify({ error: "Database unavailable. Try again shortly." }),
        );
      } else res.end();
    }
  };
  const server = createServer(handleRequest);
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  return { server, handler: handleRequest, ready, close: () => db.close() };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { port, host, databasePath } = runtimeConfig();
  const { server, close } = createApplication(databasePath);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => {
      server.closeAllConnections();
    }, 10000);
    timer.unref();
    server.close(() => {
      clearTimeout(timer);
      close();
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.listen(port, host, () =>
    console.log(`Warehouse API listening on ${host}:${port}`),
  );
}
