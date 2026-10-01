export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT || 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  const production = env.NODE_ENV === "production";
  if (env.PUBLIC_ORIGIN) {
    const origin = new URL(env.PUBLIC_ORIGIN);
    if (
      origin.origin !== env.PUBLIC_ORIGIN ||
      origin.username ||
      origin.password ||
      !["http:", "https:"].includes(origin.protocol)
    )
      throw new Error(
        "PUBLIC_ORIGIN must be an exact HTTP(S) origin without a path.",
      );
    if (production && origin.protocol !== "https:")
      throw new Error("Production PUBLIC_ORIGIN must use HTTPS.");
  } else if (production)
    throw new Error(
      "Set PUBLIC_ORIGIN to the public HTTPS origin before starting production.",
    );
  if (env.DATABASE_URL) {
    const database = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(database.protocol))
      throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
  }
  if (env.VERCEL && !env.DATABASE_URL)
    throw new Error("Vercel requires DATABASE_URL for durable data.");
  if (
    production &&
    !env.DATABASE_URL &&
    (!env.DB_PATH || env.DB_PATH === ":memory:")
  )
    throw new Error("Production requires DB_PATH on durable storage.");
  return {
    port,
    host: env.BIND_HOST || "127.0.0.1",
    databasePath: env.DB_PATH || "./var/warehouse.db",
  };
}
