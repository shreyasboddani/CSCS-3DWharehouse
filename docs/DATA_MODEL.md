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
