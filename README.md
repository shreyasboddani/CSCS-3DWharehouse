# CSCS Warehouse Twin

React warehouse builder and operations workspace with an interactive procedural Three.js facility. This SaaS product is under development. It is an original interface; no live SCOTI connection is implemented. Manual records, CSV imports and external location mappings are available.

## Run locally

Requires Node.js 24+ for the SQLite backend.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The command also starts the API on port 4310. Register a local workspace and create a warehouse. Data persists in var/warehouse.db; keep that directory when restarting. Examples are explicitly labeled and never replace existing records.

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm start
```

After building, npm start serves the app and API at http://localhost:4310. For HTTPS hosting configure NODE_ENV=production, PUBLIC_ORIGIN to the exact public origin, DB_PATH to durable storage, and PORT as needed. The process binds to localhost for a reverse proxy. Production cookies require HTTPS. Vite preview does not start the API.

## Current features

- Accounts, isolated workspaces, persistent warehouse CRUD, optimistic versions and activity history.
- Through/U/L templates, stable aisle/bay/level/bin addresses, dock and workstation counts, quality/returns areas, finish and height options, yard sizing, and zone offsets with boundary/overlap validation.
- Detailed racks/cartons/pallets, docked trucks, packing/scanning equipment, complete architecture, cutaway/exterior views, roof/trusses/lights, yard markings and service fixtures.
- Orbit/top/walk modes, smooth area navigation, exact bin selection, inspector, fullscreen views and GLB export. SVG dashboard thumbnails and WebGL fallback.
- Manual records/cargo manifests; validated CSV preview and atomic import; alias mapping; CSV/layout exports.
- Guarded arrival, whole-manifest receiving with inbound departure, putaway, transfer, pick, pack, load, partial/full unload, counted adjustments, dispatch, hold/release. Quantity conservation and SKU/batch retention.

## Product limits and next work

The scene visualizes saved state rather than autonomously simulating warehouse operations. Staff, forklifts and equipment are illustrative fixtures. Cartons represent occupancy rather than exact physical counts. Walking avoids racks and packing benches; small decorative fixtures are not all collision obstacles yet.

Templates currently generate rectangular facilities with standard rack modules. Irregular buildings, arbitrary wall/door editing, individual rack rearrangement, partial receipts/discrepancies, dedicated quality/returns workflows, weight/dimensional capacity, fleet telemetry, conveyor routing and industry-specific processes remain future work. SCOTI integration awaits supported documentation and an approved environment.

Before customer launch, complete identity recovery/verification, workspace roles/membership, staging deployment validation and off-site backup/recovery operations, observability, security review, broad device/accessibility coverage, retention controls and commercial requirements. Local checks are not production certification.

## Architecture

- src/domain: schemas, deterministic layout/operations, CSV validation, navigation and exterior dock placement.
- server/index.ts: authorized API, SQLite, sessions, guarded writes and activity.
- src/app: session/API service, workflow dialogs, SVG floor plans.
- src/scene: optional lazy renderer/controller and procedural facility models.
- src/App.tsx: routes, dashboard, builder, inspection/directory, accounts.

Read docs/PROJECT_CONTRACT.md, docs/DATA_MODEL.md and docs/DESIGN_SYSTEM.md before changes. Shared saved state is the source of truth; 3D never mutates business state independently.

## Release hardening and deployment

Location quantity limits, operational summaries/exception links, manifest ownership protection, cycle counts, complete directory pagination, recoverable warehouse archive/restore and backup/restore CLI are implemented. Docker/Compose packaging is provided. Read docs/DEPLOYMENT.md for runtime and recovery instructions and docs/RELEASE_READINESS.md for the exact release gates. The product is not yet certified ready for unrestricted client launch.

## Vercel and Neon

See [docs/VERCEL.md](docs/VERCEL.md) for a separate Neon project, server-only DATABASE_URL, PUBLIC_ORIGIN, preview isolation, and deployment acceptance checks. The public landing page has a real interactive example and responsive product walkthrough. A live deployment still needs your environment configuration and the release gates in docs/RELEASE_READINESS.md.
