import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pg from "pg";
import type { PoolClient } from "pg";

type Value = string | number;
type Row = Record<string, unknown>;
/** One checked-out connection per request; explicit transactions never cross requests. */
export function openDatabase(path: string, connectionString?: string) {
  const context = new AsyncLocalStorage<PoolClient>();
  if (connectionString) {
    const url = new URL(connectionString);
    if (url.hostname.endsWith(".neon.tech")) {
      url.searchParams.set("sslmode", "verify-full");
      connectionString = url.href;
    }
  }
  const pool = connectionString
    ? new pg.Pool({
        connectionString,
        max: 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
        statement_timeout: 15000,
      })
    : undefined;
  if (!pool && path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const local = pool ? undefined : new DatabaseSync(path);
  pool?.on("error", () => {
    /* Idle clients are discarded; requests report unavailability. */
  });
  let queue: Promise<unknown> = Promise.resolve();
  const sqlForPostgres = (sql: string) => {
    let parameter = 0;
    return sql.replace(/\?/g, () => `$${++parameter}`);
  };
  async function query(sql: string, values: Value[]) {
    if (local) {
      const statement = local.prepare(sql);
      if (/^\s*(SELECT|WITH)/i.test(sql) || /\bRETURNING\b/i.test(sql))
        return { rows: statement.all(...values) as Row[], changes: 0 };
      return {
        rows: [] as Row[],
        changes: Number(statement.run(...values).changes),
      };
    }
    const client = context.getStore();
    const result = await (client || pool!).query(sqlForPostgres(sql), values);
    return { rows: result.rows as Row[], changes: result.rowCount || 0 };
  }
  return {
    remote: !!pool,
    prepare(sql: string) {
      return {
        async get(...values: Value[]) {
          return (await query(sql, values)).rows[0];
        },
        async all(...values: Value[]) {
          return (await query(sql, values)).rows;
        },
        async run(...values: Value[]) {
          return await query(sql, values);
        },
      };
    },
    async exec(sql: string) {
      if (local) local.exec(sql);
      else await (context.getStore() || pool!).query(sql);
    },
    async withConnection<T>(work: () => Promise<T>): Promise<T> {
      if (local) {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return await next;
      }
      const client = await pool!.connect();
      try {
        return await context.run(client, work);
      } finally {
        // Also clear aborted transactions after unexpected exceptions.
        try {
          await client.query("ROLLBACK");
        } catch {
          /* pool discards broken connections */
        }
        client.release();
      }
    },
    async close() {
      if (local) local.close();
      else await pool!.end();
    },
  };
}
