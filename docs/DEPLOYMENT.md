# Deployment and recovery runbook

This packages the current application. Complete the gates in RELEASE_READINESS.md before client rollout.

## Vercel

For the managed PostgreSQL deployment, follow [VERCEL.md](./VERCEL.md). The SQLite instructions below apply to the local/container option only.

## Runtime

- Node 24+, npm, one application instance, local durable SQLite storage. Do not share this database between replicas or mount it on an unverified network filesystem.
- Build with `npm ci` and `npm run build`. Runtime-only installation uses `npm ci --omit=dev`; `tsx` is a runtime dependency.
- Set `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your.actual.domain`, `DB_PATH=/durable/path/warehouse.db`, `PORT=4310`. `BIND_HOST=127.0.0.1` is the default. The origin must be exact, without trailing slash, path, query or credentials.
- Environment variables must be supplied by the service/container. `npm start` does not load `.env` automatically.
- Put the app behind a TLS reverse proxy with request size limits, upstream timeout, edge abuse controls and no public direct access to the HTTP backend. Cookies use Secure in production. Do not trust arbitrary forwarded IP headers; the current application buckets by socket IP and account, so shared proxy traffic needs an appropriate edge limit.
- Health check: GET `/api/v1/health` verifies the database connection can execute a query. It is not a full readiness, disk capacity, backup or dependency health check.

## Container option

Set PUBLIC_ORIGIN in your Compose environment, then run `docker compose up --build -d`. The provided Compose file binds HTTP only to localhost:4310 and uses a named data volume. The non-root image exposes 4310 internally. Termination allows requests to drain; the database closes afterward.

Example host reverse proxy (configure your own valid domain/TLS):

```caddy
warehouse.example.com {
    request_body {
        max_size 1MB
    }
    reverse_proxy 127.0.0.1:4310
}
```

Container files are provided but must be built and exercised on the target infrastructure. Do not treat a successful frontend build as proof of a working container/TLS/volume setup. Pin approved base-image digests and maintain dependency/image updates in your release process.

## Backup

```sh
npm run db:backup -- /durable/path/warehouse.db /secure/backups/warehouse-2026-09-30.db
```

This uses online SQLite backup, checks integrity and required tables, and refuses to overwrite an existing destination. Do not copy only a live WAL database file manually. Choose a unique destination each time. If a backup fails, do not use its incomplete destination; inspect it and rerun to a new path. Backups contain all tenants, password hashes and session tokens: restrict access and encrypt stored/off-site copies. File permission mode 0600 is requested for new backups; configure Windows ACLs or host permissions appropriately.

Configure scheduling, retention and encrypted off-site replication in the deployment environment. The CLI is not itself a backup scheduler.

## Restore rehearsal

```sh
npm run db:restore -- /secure/backups/warehouse-2026-09-30.db /durable/path/warehouse-restored.db
```

Restore verifies the source, copies to an exclusively new destination, then checks the copy. It does not overwrite a running database. Stop the application, preserve its current database/WAL/SHM files, change DB_PATH to the verified restored path, and restart. Check login, warehouse count, representative records, activity, mappings, archives and a guarded write. A snapshot also contains sessions; invalidate sessions as part of the operational recovery policy if required. Record the rehearsal duration and acceptable data-loss interval.

## Staging acceptance

1. Run typecheck, lint, tests and build from a clean install.
   Then run `npm run smoke:production` to exercise the production process with an isolated temporary database. The smoke check removes only its own test database afterward.
2. Start with the production environment and reject invalid/missing origin/storage configuration.
3. Verify HTTPS login/cookie flags, same-origin write acceptance, cross-origin rejection and tenant isolation.
4. Create a warehouse; add/import records; execute receipt → putaway → pick → pack → load/unload → dispatch. Reject overfill, stale versions and broken manifests. Confirm persistence after restart.
5. Exercise archive/restore and backup recovery using representative data.
6. Verify assets, SPA deep links, SVG fallback, 3D/walk/top and export across target devices and maximum supported layouts.
7. Exercise concurrency, traffic limits, disk-full handling, network interruption, process termination, logs/alerts and the recovery procedure.
8. Review RELEASE_READINESS.md and get scope/security/operations sign-off before exposing client data.
