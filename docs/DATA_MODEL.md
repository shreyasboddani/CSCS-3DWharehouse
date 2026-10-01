# Data model and import contract

PostgreSQL (Neon on Vercel) or local SQLite stores tenants, users, hashed server sessions, shared sign-in attempt buckets, warehouse JSON payloads, and archived warehouse payloads with independently guarded versions. DATABASE_URL selects PostgreSQL; Vercel requires it. Warehouses contain config, records, timestamps, and up to 2,000 activity entries. Customer data is not stored in browser local storage. API prefix: `/api/v1`.

Configuration: name/site, flow template, width/depth, aisles/aisle width, bays/levels/bins, receiving/shipping doors, staging/packing counts. Optional: quality stations, returns lanes, ceiling height, yard depth, rack/floor finishes, zone offsets, external mappings, per-location quantity capacity rules with an exact unit. Optional defaults preserve earlier layouts.

Layout includes locations, rack bounds, zone centers, capacity, required footprint and errors. Capacity = aisles × 2 rack faces × bays × levels × bins. `A01-L-B01-L01-01` means aisle 1, left face, bay 1, level 1, bin 1. Other addresses: IN, STG, QC, RET, PACK, OUT with two-digit numbers. External mappings resolve unique export IDs to existing addresses.

Records: id, kind, label, status, locationId, sku, quantity, reference, destination, scheduledAt, notes, source. Optional unit, batch, cargo, heldFrom, loadedOnTruckId. Quantity is a nonnegative integer in one declared unit; no conversions. Kinds: Inventory (storage), Truck (inbound/outbound), Handling unit (staging/storage/outbound), Packing task (packing). Status constraints depend on kind.

Cargo lines: unique ID, SKU, positive integer quantity. Truck quantity is an independent manual summary; manifest quantities drive receiving/loading and are not counted again as physical stock. Stock moves create a new ID and decrement/remove the source, preserving SKU/batch. Loading creates a ready handling unit and linked cargo line. Dispatch marks linked ready handling units dispatched. External cargo IDs are permitted; matching local records must agree in location, SKU, quantity and state.

## CSV

UTF-8 with optional BOM. Required case-sensitive headers: `id,kind,label,status,locationId,quantity`. Export/template also include `sku,unit,batch,reference,destination,scheduledAt,notes,cargo,heldFrom,loadedOnTruckId`. Quotes, commas and multiline values are supported. Cargo is a JSON array inside a quoted cell. Use ISO timestamps with timezone. Imported source is assigned by the server.

UI file limit 900 KB, parser limit one million characters, HTTP body limit 1 MB, maximum 10,000 rows/records. Duplicate IDs and invalid mappings/quantities/statuses fail the whole import. Matching IDs are replaced; a blank cargo field clears that truck manifest. Formula-leading exported values receive an apostrophe prefix for spreadsheet safety; remove it deliberately if reimporting those literal strings.

`POST /warehouses/:id/import`: `{version,csv}`. `POST /warehouses/:id/operations`: `{version,operation:{type,recordId,quantity?,locationId?,reference?}}`. All updates validate before a version-guarded database write and activity entry.

Cycle count operations accept a nonnegative counted quantity and require a reason/reference. Load records carry a truck ID; unloading updates stock and cargo together. Generic edits/imports/deletion cannot remove or change loaded stock ownership, quantity, SKU, location or lifecycle. Capacity rules apply to active physical stock, including held records, excluding expected/dispatched stock and truck summaries. Unit comparison is exact; there is no conversion.

DELETE /warehouses/:id archives transactionally with a version check. GET /warehouses/archived lists tenant-scoped archive summaries; POST /warehouses/:id/restore accepts {version}, restores the complete payload and advances its version. Record deletion remains permanent; archive retention/purge policy is not yet implemented.

## Saved spatial design

Optional `WarehouseConfig.design`: `{version:1, grid, floors:[{id,name,height,outline:[{x,z}],modules:[]}]}`. Coordinates use meters in a centered X/Z site. `height` is clear height. Module IDs and floor IDs are stable. Modules persist catalog kind, label, position, cardinal rotation, width/depth/height, address number, rack bays/levels/bins/aisleWidth, optional per-bin quantity capacity/unit, task, preview speed, waypoints, loop flag and source/target module IDs. Geometry is validated by `src/domain/design.ts`; schema limits live beside these rules.

Storage locations include optional floorId/moduleId; rack descriptors include per-module dimensions and rotation/elevation. Ground-floor address strings retain legacy format; upper floor IDs prefix the same format. For example `mezzanine-A01-L-B01-L01-01`. Explicit location capacity rules override an aisle default. Area modules are planning overlays and do not create inventory addresses. AS/RS blocks and other fixtures are visual equipment rather than mapped internal storage bins. Workflow links refer to another module on the same floor. Robot routes begin at the saved robot position and stay within the floor with fixture clearance; playback is illustrative.

The existing warehouse API accepts/persists design through the config schema and validates records, external mappings and capacity rules before a version-guarded write. There is no feature-local inventory store. No database migration is required because configuration is stored as JSON. Existing warehouses without design retain the original generation path.

## Local automation simulation

Optional `Warehouse.automation` stores `mode:simulation`, design signature, elapsed simulated seconds, global pause, robot snapshots, route missions, conveyor readiness/buffers and virtual totes. It shares the durable warehouse payload, workspace authorization and warehouse revision guard. `POST /warehouses/:id/automation` accepts `{version,command}`: reset, pause, step (1–30 seconds), enqueue (robotId/priority 1–5), enable, charge, cancel, equipment readiness and virtual tote injection. The server parses each command and computes the next state in `src/domain/automation.ts`. Layout writes clear this state.

Fixed 0.1-second steps, at most 50 robots, 100 active missions/totes and 100 retained terminal items bound the simulator. Per-robot circuits start at its saved position and return there; cancellation leaves its current position and requires reset if another circuit cannot start there. Circular collision envelopes include robot footprint corners plus 0.15 m clearance. Priority chooses queued work and traversal ordering; blocked robots wait, including deadlocks. The simulation does not certify physical collision avoidance. Charging requires proximity to a same-floor available charger; 0.5 percentage points/second to 95% and 0.02 percentage points/meter consumption are illustrative constants, not vendor values. The 15% reserve blocks further travel.

Conveyor tokens are explicitly virtual totes, separate from records and stock. Belts/rollers/sorters have four logical buffer slots. A tote advances by configured speed and belt depth, transfers to a ready same-floor linked conveyor with buffer capacity, or finishes at a receiving fixture. Assigned destination-source mismatches, missing endpoints and cycles wait with a reason. This validates logical readiness/hand-offs; it does not infer physical conveyor connectivity, sensors, load dimensions or real-time controller behavior. No vendor protocol compliance is claimed.

## Design drafts

`design_drafts` stores workspace-scoped design snapshots in the same durable database as warehouses. Drafts include ID/version, configuration, optional target warehouse ID, creation/update timestamps, completed flag and editor context (mode, active floor, unfinished outline points). Configuration is structurally bounded but permits blank names/labels and unresolved geometry; drafts never create inventory or mutate an existing warehouse. Active drafts are limited to 200 per workspace.

GET/POST `/drafts` lists/creates drafts. GET/PUT `/drafts/:id` loads or replaces a snapshot; PUT requires its current version. POST `/drafts/:id/complete` marks it completed after an operational warehouse save, retaining the snapshot while removing it from the active list. Authentication and workspace ownership apply to every request. A linked warehouse must belong to the same workspace. The 2D editor debounces autosave by 1.5 seconds; Save draft provides an explicit flush and Back to builder flushes before closing. Network/conflict failures are shown; an unsaved/offline change must not be assumed persisted. Template configuration also offers manual Save draft. The dashboard resumes either editor mode using a draft query ID.
