# Product contract

Warehouse Twin is a SaaS product in development. Each workspace owns its persisted configuration and operational records. This original interface does not claim to reproduce production SCOTI. The live adapter awaits supported API documentation, authentication details, field semantics, and an approved environment. Manual data and CSV import are the current path.

Journey: register → dashboard → configure receive/stage, storage, pack/dispatch → review layout validation → save → inspect/walk → add/import records → guarded workflows → activity and export.

Business rules belong in `src/domain`. Server authorization checks the authenticated workspace on each request. Components and 3D modules render saved state. Never create feature-local inventories. Synthetic data comes from `exampleWarehouse()` and stays explicitly labeled. Editing examples turns edited records into manual data.

Stable logical addresses survive physical offsets and footprint expansion. Layout reductions cannot orphan records or external mappings. Each mutation requires the current warehouse version; stale requests return 409 and require reload. Imports are atomic and replace matching record IDs while retaining other records. Only one docked/held truck may occupy a dock. A cargo ID cannot belong to two docked trucks.

Current operations: expected arrival, whole-manifest receipt into staging with inbound departure, putaway, transfer, pick with order reference, pack, load onto a docked outbound truck, partial/full unload, cycle count with reason, dispatch, hold, and restoration of the pre-hold state. Invalid transitions, excess quantity, wrong areas, holds, and mismatched manifests fail without a partial write. A manually entered hold without previous state needs a manual status edit.

3D is optional enhancement. One meter is one world unit; Y is up. Dock frames lie on the actual exterior wall, with trucks facing outward and trailer rears meeting the threshold. Expected/dispatched trucks are not drawn docked. Cutaway shows labeled transparent near walls; complete-building includes all walls and roof; walking uses a solid shell. SVG plan and address directory remain usable without WebGL. Dashboard thumbnails do not allocate GPU renderers. Dispose GPU resources on replacement. Animation never changes records independently.

Remaining releases: partial receipt/discrepancies, dedicated quality/returns workflows, irregular shells, per-module editing, complete fixture collisions, roles, staging deployment verification, approved SCOTI adapter. These are requirements rather than completed capabilities.

Capacity rules constrain physical quantity in one exact unit at a storage, staging, or packing address. Held stock consumes capacity. Cargo ownership cannot be severed through generic edits/imports/deletion. Warehouse removal archives the complete payload; dashboard restore advances its version. See RELEASE_READINESS.md for implemented scope, verified checks and remaining client-launch gates.

Vercel deployments use Neon PostgreSQL through server-only DATABASE_URL. Accounts, sessions, warehouse payloads, archives, and auth attempt buckets share durable server storage. Local development may retain SQLite. Database access is asynchronous, with one PostgreSQL connection per request and explicit transaction boundaries. The public landing renders the canonical example without persisting or mutating it; SCOTI connectivity remains pending.
