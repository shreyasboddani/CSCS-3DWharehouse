# Release readiness — 2026-09-30

## Decision

This repository is a working SaaS application in development, not a complete WMS or a certified production digital twin. This pass improves operational integrity and deployability. **Do not sell it as covering every warehouse case or as ready for unrestricted client production use.** SCOTI documentation is one dependency; the release gates below are additional work.

## Implemented scope

| Area | Available behavior | Important boundary |
| --- | --- | --- |
| Workspace | Accounts, server sessions, tenant-scoped persistent warehouses | Each registration creates a separate workspace; no team membership or roles |
| Layout generator | Three rectangular flow templates; dimensions, rack/bay/level/bin counts, docks, staging, QC/returns locations, packing stations, area offsets, finishes, ceiling and yard | Custom polygon shells, catalog module placement and stacked floors are available; no CAD ingestion or engineering certification |
| Visualization | Procedural PBR facility, exterior docks/trucks, architecture, equipment, roof/cutaway, top view, walk, area navigation, selected address and stock | Saved operational context; worker/equipment animation is illustrative, not telemetry or a physical simulation |
| Location addressing | Stable aisle / face / bay / level / bin IDs, exact address selector, searchable and paginated directory, external aliases | External aliases are manual mapping, not API synchronization |
| Inventory | Manual stock, batch, declared unit, quantities, holds, counted adjustments and movement activity | No expiry/serial genealogy, unit conversion, FIFO/FEFO allocator or automated replenishment |
| Capacity | Optional per-location quantity limit and unit; enforced on edits, imports, counts and moves | Not dimensional fit, rack weight rating, stacking rules, hazardous goods segregation, or fire-code approval |
| Receiving | Scheduled truck record, arrival guard, whole-manifest receipt into received handling units, inbound departure | No partial line receipts, over/short/damage reconciliation, unloading task assignment or ASN matching |
| Storage / picking | Putaway, bin transfer, order-referenced pick to packing; quantity and batch preserved | No order management engine, wave planning, replenishment scheduler, optimized pick route or cross-facility transfer |
| Packing / shipping | Pack completion, load with linked handling units, partial/full unload, manifest validation, dispatch | No carrier purchase, shipping labels, cartonization, appointment scheduler or shipment tracking feed |
| QC / returns | Generated inspection/returns addresses; held stock and putaway from these locations | Dedicated inspection results, dispositions, return authorization and repair/scrap workflows remain unimplemented |
| Import / export | Validated atomic CSV upsert with preview, JSON layout, CSV records and binary GLB | No general CAD/IFC/BIM interchange; GLB shows the scene, not operational synchronization |
| Recovery | Archive and restore complete warehouses; version conflicts; SQLite backup and restore CLI | No record trash, arbitrary revision rollback or guaranteed off-site backup schedule |
| Operations overview | Occupied bins, physical quantities separated by unit, ready tasks, holds, expected trucks, overdue appointments, missing manifests and capacity alerts | A snapshot of saved records; not utilization forecasting, labor/resource simulation or a comprehensive exception engine |
| SCOTI | Manual external ID mappings and CSV data path | Live adapter, credentials, supported schema, telemetry and automatic population are not implemented |

## Changes in this pass

- Loaded cargo now carries an explicit `loadedOnTruckId`. Manual edits, imports and deletion cannot sever its saved truck/manifest relationship. Unload updates cargo and stock together; dispatch checks readiness and matching quantities.
- Cycle counts require a counted integer quantity and a reason/reference. Zero counts are supported. The activity entry records old/new quantity; this is an intentional stock adjustment, not a conserved transfer.
- Capacity limits reject overfill and mixed units at a constrained location. Held physical stock still consumes capacity. Truck summaries/manifests are excluded from physical stock totals.
- CSV rejects characters after closed quotes, nondecimal quantities and invalid combined record sets. Export handles formula-leading values after whitespace. The template includes the new cargo ownership column.
- Archive/restore is tenant-scoped and transactional. Archiving moves the complete payload into a separate table; restoring retains records, configuration and activity while advancing the version.
- All directory matches can be paged. Record dialogs now share Escape/focus containment and restoration. Large lookups use maps/sets instead of repeated layout scans.
- Production startup requires an exact HTTPS public origin and an explicit durable database path. Runtime TypeScript loading is a production dependency. Added container packaging, request timeouts, request IDs, static asset errors/caching, stronger CSP, UTF-8-safe request assembly, bounded password jobs, account/IP attempt limits and graceful shutdown.
- Added backup/restore tooling using SQLite's online backup facility with integrity checks and exclusive destinations. It never overwrites an existing database/backup.

## Local evidence

- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` are the required checks. The expanded suite contains 17 tests across layout/address stability, navigation clearance, CSV parsing/atomic imports, stock conservation, manifest protection/unload, counts/capacities, tenant isolation, version conflicts, sessions and interrupted/stale session checks, archive/restore, production configuration and backup/restore of actual saved records.
- Browser QA on a labeled local test warehouse: exact address selection, capacity save, over-limit rejection, successful manual record save, cycle count and activity update, page 2 of the directory, top/walk controls, archive/dashboard restore and preserved quantity. No console errors/warnings were captured during these checks.
- These are local checks. They do not establish broad device compatibility, multi-user/load performance, accessibility conformance, penetration-test results or availability under real production infrastructure.
- `npm run smoke:production` also passed against a separately started production process and a temporary database: SPA deep link, built asset/cache headers, database health, Secure/HttpOnly/SameSite cookie flags, authenticated session and rejected cross-origin write. This exercises production environment guards but not real HTTPS. The Docker CLI is unavailable here, so container/TLS/volume checks remain unverified. The optional Three.js chunk still emits Vite's >500 KB advisory; measure load/GPU budgets on target devices before launch.

## Required gates before client launch

1. **Identity and authorization:** password reset/recovery, verification or approved enterprise identity provider, team membership, explicit owner/editor/viewer permissions enforced on every API, session management/revocation UX, and onboarding abuse controls. Existing tenant isolation does not substitute for roles.
2. **Warehouse scope acceptance:** agree which workflows the client will rely on. Implement partial receiving/discrepancies, QC/returns disposition and order/task lifecycle if included in the product promise. Do not claim autonomous warehouse execution, engineering safety validation or all industry-specific processes.
3. **Layout and navigation completeness:** Validate custom shells and placement on client layouts, complete walk obstacles, floor accessibility, large-layout GPU budgets, recovery from context loss and high-resolution export validation.
4. **Operational durability:** execute the deployment runbook in staging, provision TLS, monitor errors/latency/disk space, store encrypted off-site backups, schedule and rehearse recovery, set RPO/RTO, and select a supported single-instance SQLite deployment or migrate to a database suitable for the target concurrency. Full warehouse payloads are currently returned by the dashboard API; server-side pagination/projections are needed for large networks.
5. **Security and data governance:** independent review, load/abuse testing including reverse-proxy rate limiting, secrets controls, retention/deletion policy, record recovery, audit retention beyond the current last 2,000 entries, privacy/terms/support ownership and tenant export/deletion procedures. Request IDs exist; a metrics/log aggregation/alerting system does not.
6. **Client device and accessibility matrix:** keyboard/screen reader audits, mobile/touch and low-end GPU testing, reduced motion, contrast, browser matrix, offline/network-interruption behavior and concurrency conflict UX.
7. **SCOTI integration:** official API/auth/permissions/schema, external warehouse and location identifiers, inventory/manifest units and lifecycle semantics, pagination/change feed, rate limits, retries/idempotency, conflict ownership, secrets on the server, connection health, disconnect/revocation, sandbox tests and an approved integration environment.

There is no live connection to SCOTI and no claim that this interface reproduces production SCOTI.

## Implementation references

Deployment guidance uses the [Node SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-path-options). Session/identity release gates are informed by the [OWASP Session Management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [Authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). These references are design guidance, not a certification of this application.

Session recovery now distinguishes a failed connection check from an anonymous session, offers retry, preserves warehouse return paths through sign-in, ignores stale auth checks/expired responses after a newer sign-in, and prevents an old workspace refresh from repopulating a new session. These cases are covered by the session tests; the preserved warehouse destination was also verified in the browser.

## Landing and Vercel update — 2026-10-01

The public landing now includes an interactive canonical example, area guides, camera controls, template explanations, location/data context, FAQ, and responsive calls to action. Neon PostgreSQL is supported via DATABASE_URL; Vercel API/SPA routing is packaged. Auth limits persist across instances, and database transactions use request-scoped connections. Local SQLite remains supported. New deployment tests cover storage configuration, application replacement, and transaction scope; PostgreSQL CI tests exercise two instances and conflicting writes. No live Neon credentials or Vercel deployment were supplied, so real staging verification remains required. Identity recovery/verification/roles and the other client-launch gates above remain open.

## Builder capacity and units pass — 2026-10-07

Removed fixed caps on building dimensions, aisle/dock/station counts, rack section/level/bin counts, custom floor/module/outline counts and address generation. Regression coverage generates 250 aisles with 500 dock doors and all 30,000 storage addresses through template and custom layouts, including authenticated warehouse save/reload and draft save/resume. A separate 30-aisle case generates 115,200 addresses. Tests also cover physical overcount rejection before allocation, automatic fitting across flow templates, resized dock alignment, retained IDs and concave-shape repair.

Lengths now convert to feet throughout the builder, design editor, workspace and equipment inspectors. Automatic reflow, buffered numeric editing, measured rulers and dimension-aware scene camera/shadow ranges support larger designs; new roofs default to 50 ft. Geometry remains metric internally.

Current local verification: typecheck, lint and production build passed; the test suite has 48 passing tests and one PostgreSQL integration test skipped because no test database is configured. The build retains its large-chunk advisory. The browser tool is disconnected in this session, so these new visuals have not received browser QA. The 250-aisle test establishes domain generation and draft validation, not a frame-rate guarantee on client hardware. Production PostgreSQL integration testing requires a configured test database. Previous browser observations above describe earlier passes only. The client device, accessibility and staging deployment gates remain open.

## Visual quality and memory pass � 2026-10-07

Typecheck, lint and production build passed. The current suite has 53 passing tests and one PostgreSQL integration test skipped without a configured database. New coverage checks 500-aisle structural previews and cache invalidation, shared geometry and instance selection across 5,000 parts, concave roof/dock architecture, photo CSV/search behavior, and authenticated photo upload/read/deduplication with workspace isolation.

The shared-geometry test measures vertex/matrix allocation savings for repeated parts; it does not establish a whole-application RAM percentage or client frame-rate guarantee. No browser surfaces were available in this session, so these visuals still require browser/device QA. The production build retains its large-chunk advisory. Live Neon/Vercel verification and earlier identity/role/client-launch gates remain open. Restart `npm run dev` once to initialize the image table and load new API routes; the existing API process does not watch source changes.
