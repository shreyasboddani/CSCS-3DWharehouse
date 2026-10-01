# Vercel + Neon deployment

Use a **separate Neon project for Warehouse Twin**, independent of Mentics. The browser talks to same-origin `/api/v1` routes; a Vercel Node function authenticates requests and stores accounts, hashed sessions, warehouses, archives, and sign-in attempt limits in PostgreSQL. The frontend never receives database credentials.

## Setup

1. Create the separate Neon project. Choose a region near your Vercel function region. Use the **pooled connection string** from Neon’s Connect dialog.
2. Import `shreyasboddani/CSCS-3DWharehouse` into Vercel. Use the repository root, Vite framework, Node **24.x**, `npm run build`, and output `dist`. The checked-in `vercel.json` supplies routes, function settings, and security headers.
3. Add these **server environment variables** in Vercel:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled PostgreSQL URL, including username/password and TLS settings |
   | `PUBLIC_ORIGIN` | Exact public HTTPS origin, such as `https://warehouse.your-domain.com`; no trailing slash or path |

   Do not prefix these with `VITE_`. Do not commit them. Vercel supplies `NODE_ENV=production`. `DB_PATH` is unnecessary on Vercel; the function refuses to use ephemeral SQLite there. Neon URLs are normalized to `sslmode=verify-full` for certificate validation.
4. Set `PUBLIC_ORIGIN` to the final domain before testing writes. If you deploy first on a generated `*.vercel.app` production domain, set that exact origin and redeploy. Update it again when attaching a custom domain. Writes from other aliases are intentionally rejected.
5. Deploy. The first API initialization creates the schema if absent. The database role must be permitted to create these tables/indexes. A PostgreSQL advisory lock serializes schema creation across cold starts. This is the initial schema bootstrap; future schema changes need explicit versioned migrations.
6. Visit `/api/v1/health`, then complete the acceptance checks below. Missing configuration returns a generic 503, rather than silently storing customer data in a temporary file.

## Preview isolation

Use a separate Neon branch/database and separate `DATABASE_URL` for **Preview** deployments. Never point untrusted preview code at production customer data. Preview writes accept the exact HTTPS `VERCEL_URL` supplied by Vercel; production accepts `PUBLIC_ORIGIN`. Alternate preview aliases are not automatically allowed. Vercel environment changes require a redeployment.

## Login and data behavior

- Registration creates a workspace and its owner account; passwords are salted and hashed with scrypt. Sessions use random tokens, stored as hashes, with seven-day expiry. The cookie is HttpOnly, Secure in production, and SameSite=Lax.
- Every warehouse read/write is scoped to the authenticated tenant. Optimistic version checks reject stale edits. Archive and restore use database transactions on the request’s own PostgreSQL connection.
- Sign-in attempts are persisted in the database so function instances share limits. Configure additional Vercel edge abuse protection. Vercel’s forwarded client address is used only in the Vercel environment; other hosts use the socket address.
- Existing local SQLite accounts and facilities **are not copied to Neon automatically**. New deployments start with the new database’s contents. JSON/CSV exports can preserve facility specifications and records; a controlled account/data migration is separate work if you need local data carried over.
- The current identity system has no password recovery, email verification, team invitations, or per-member roles. These remain client-launch requirements in [RELEASE_READINESS.md](./RELEASE_READINESS.md). Database hosting does not implement those features.

## Acceptance before client data

1. Health returns `{ "ok": true }`; built assets and a direct `/app/warehouses/<id>` deep link load.
2. Register an isolated staging account; confirm Secure/HttpOnly cookie flags, sign out, sign in again, and return to a protected deep link.
3. Create a facility, import records, perform guarded operations, archive/restore, and reload. Redeploy or replace the function instance; confirm data and the valid session remain available.
4. Use a second account to verify tenant isolation. Edit the same version in two sessions; one must return 409. Cross-origin writes must return 403.
5. Verify 3D/floor-plan alternatives and responsive layout on target devices. Exercise database outages and retry behavior.
6. Configure Neon recovery/retention for your plan, restrict console/database access, and rehearse recovery. The SQLite `db:backup` / `db:restore` commands **do not back up Neon**. Use Neon’s database recovery/export procedures.

Local tests exercise SQLite persistence and function configuration guards. CI additionally starts an isolated PostgreSQL 17 service and verifies shared sessions, tenant isolation, concurrent writes, archive/restore, and logout across two application instances. These checks do not replace a live Neon/Vercel staging verification.

## References

- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon with Node.js](https://neon.com/docs/guides/node)
- [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel routing configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Why file SQLite is unsuitable on Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
