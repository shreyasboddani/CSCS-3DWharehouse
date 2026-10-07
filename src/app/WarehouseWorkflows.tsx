import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./service";
import { generateLayout, validateRecordSet } from "../domain/warehouse";
import type { Warehouse, OperationalRecord } from "../domain/warehouse";
import { importCsv, sampleCsv } from "../domain/csv";
import type { Operation } from "../domain/operations";
import type { operationalSummary } from "../domain/summary";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null),
    close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const items = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
        ) || [],
      );
    items()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const list = items(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      requestAnimationFrame(() => {
        if (prior?.isConnected) prior.focus();
      });
    };
  }, []);
  return (
    <div className="modal-overlay">
      <section
        ref={ref}
        className="modal workflow-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="workflow-heading">
          <div>
            <span className="eyebrow">WAREHOUSE OPERATIONS</span>
            <h2>{title}</h2>
          </div>
          <button aria-label="Close dialog" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function templateDownload() {
  const url = URL.createObjectURL(new Blob([sampleCsv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "warehouse-records-template.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Props = {
  warehouse: Warehouse;
  onClose: () => void;
  onSaved: (w: Warehouse) => void;
};
export function CapacityDialog({
  warehouse,
  locationId,
  onSaved,
  onClose,
}: Props & { locationId: string }) {
  const rule = warehouse.config.locationRules?.find(
    (r) => r.locationId === locationId,
  );
  const [capacity, setCapacity] = useState(rule?.capacity || 100),
    [unit, setUnit] = useState(rule?.unit || "units"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      const locationRules = (warehouse.config.locationRules || []).filter(
        (r) => r.locationId !== locationId,
      );
      if (!remove) locationRules.push({ locationId, capacity, unit });
      const result = await api<{ warehouse: Warehouse }>(
        "/warehouses/" + warehouse.id,
        "PUT",
        {
          version: warehouse.version,
          config: { ...warehouse.config, locationRules },
        },
      );
      onSaved(result.warehouse);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capacity could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={"Location capacity · " + locationId} onClose={onClose}>
      <p>
        Set the maximum physical quantity permitted here. Incoming moves,
        imports, counts, and edits must respect this limit and its unit. This is
        an operational quantity limit, not an engineering load rating.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field-grid">
          <label>
            Maximum quantity
            <input
              type="number"
              min={1}
              max={1000000}
              step={1}
              required
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </label>
          <label>
            Unit
            <input
              required
              maxLength={20}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {rule && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Remove limit
            </button>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save capacity"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function OperationsOverview({
  summary,
  onSelect,
}: {
  summary: ReturnType<typeof operationalSummary>;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="operations-overview" aria-label="Operational overview">
      <div className="list-heading">
        <div>
          <span className="eyebrow">FLOOR OPERATIONS</span>
          <h2>Know what needs attention.</h2>
        </div>
        <span className="subtle">Saved data · not a live SCOTI feed</span>
      </div>
      <div className="metrics">
        <div>
          <span>Storage occupancy</span>
          <strong>
            {((summary.occupied / summary.totalBins) * 100).toFixed(1)}%
          </strong>
          <small>
            {summary.occupied} of {summary.totalBins} bins occupied
          </small>
        </div>
        <div>
          <span>Physical stock</span>
          <strong>
            {summary.quantities.length
              ? summary.quantities
                  .map((q) => q.quantity.toLocaleString() + " " + q.unit)
                  .join(" · ")
              : "0 units"}
          </strong>
          <small>Truck manifests excluded to avoid double counting</small>
        </div>
        <div>
          <span>Ready to load</span>
          <strong>{summary.readyTasks}</strong>
          <small>Completed packing tasks</small>
        </div>
        <div>
          <span>On hold / expected trucks</span>
          <strong>
            {summary.holds} / {summary.expectedTrucks}
          </strong>
          <small>Follow up before moving stock</small>
        </div>
      </div>
      <details className="operational-alerts" open={summary.alerts.length > 0}>
        <summary>{summary.alerts.length} items requiring attention</summary>
        <div>
          {summary.alerts.length ? (
            summary.alerts.slice(0, 50).map((a) => (
              <button
                className="button secondary small"
                key={a.id}
                onClick={() => onSelect(a.locationId)}
              >
                {a.message} →
              </button>
            ))
          ) : (
            <p>No exceptions detected by the available checks.</p>
          )}
          {summary.alerts.length > 50 && (
            <p>
              Showing the first 50 items. Use the record directory for all
              records.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
export function ArchivedWarehouses({
  onRestored,
}: {
  onRestored: () => Promise<void>;
}) {
  type Archived = {
    id: string;
    name: string;
    version: number;
    archivedAt: string;
  };
  const [items, setItems] = useState<Archived[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ warehouses: Archived[] }>(
        "/warehouses/archived",
      );
      setItems(result.warehouses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="archive-panel">
      <button
        className="text-button"
        disabled={busy}
        onClick={() => (items ? setItems(null) : void load())}
      >
        {busy
          ? "Loading…"
          : items
            ? "Hide archived warehouses"
            : "View archived warehouses"}
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {items && (
        <div className="archive-list">
          {!items.length && <p>No archived warehouses.</p>}
          {items.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p>Archived {new Date(item.archivedAt).toLocaleString()}</p>
              </div>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api("/warehouses/" + item.id + "/restore", "POST", {
                      version: item.version,
                    });
                    await onRestored();
                    setItems(
                      (current) =>
                        current?.filter((i) => i.id !== item.id) || [],
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Restore failed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Restore warehouse
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
export function CsvImport({ warehouse, onClose, onSaved }: Props) {
  const [csv, setCsv] = useState(""),
    [filename, setFilename] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  let result: ReturnType<typeof importCsv> | undefined,
    parseError = "";
  if (csv)
    try {
      result = importCsv(csv, warehouse.config);
      const merged = new Map(warehouse.records.map((r) => [r.id, r]));
      for (const record of result.records) merged.set(record.id, record);
      const issue = validateRecordSet([...merged.values()], warehouse.config);
      if (issue && !result.errors.includes(issue)) result.errors.push(issue);
      if (merged.size > 10000)
        result.errors.push(
          "This import would exceed the warehouse record limit.",
        );
    } catch (e) {
      parseError = e instanceof Error ? e.message : "Invalid CSV.";
    }
  const updated =
    result?.records.filter((r) =>
      warehouse.records.some((old) => old.id === r.id),
    ).length || 0;
  return (
    <Modal title="Import warehouse records" onClose={onClose}>
      <p className="subtle">
        Use generated addresses or saved external location mappings. Every row
        must pass validation. Existing IDs are replaced; other records are
        retained.
      </p>
      <div className="import-drop">
        <label>
          Choose CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              setError("");
              setCsv("");
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 900000) {
                setError("Choose a file under 900 KB.");
                return;
              }
              setFilename(file.name);
              try {
                setCsv(await file.text());
              } catch {
                setError("This file could not be read.");
              }
            }}
          />
        </label>
        <button className="text-button" onClick={templateDownload}>
          Download CSV template ↓
        </button>
      </div>
      {filename && (
        <p>
          <strong>{filename}</strong>
        </p>
      )}
      {(error || parseError) && (
        <p className="notice" role="alert">
          {error || parseError}
        </p>
      )}
      {result && (
        <>
          <div className="import-summary">
            <div>
              <strong>{result.records.length - updated}</strong>
              <span>New records</span>
            </div>
            <div>
              <strong>{updated}</strong>
              <span>IDs replaced</span>
            </div>
            <div>
              <strong>{result.errors.length}</strong>
              <span>Issues</span>
            </div>
          </div>
          {!!result.errors.length && (
            <div className="import-errors" role="alert">
              {result.errors.slice(0, 30).map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          <div className="import-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type / status</th>
                  <th>Location</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {result.records.slice(0, 30).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code>{r.id}</code>
                    </td>
                    <td>
                      {r.kind}
                      <small>{r.status}</small>
                    </td>
                    <td>
                      <code>{r.locationId}</code>
                    </td>
                    <td>
                      {r.quantity} {r.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="subtle">
            Preview shows 30 rows maximum. All {result.records.length} valid
            rows are saved together. Blank cargo fields clear an existing truck
            manifest.
          </p>
        </>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          disabled={
            busy ||
            !result?.records.length ||
            !!result.errors.length ||
            !!parseError
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const response = await api<{ warehouse: Warehouse }>(
                "/warehouses/" + warehouse.id + "/import",
                "POST",
                { version: warehouse.version, csv },
              );
              onSaved(response.warehouse);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Import failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Importing…" : "Confirm import"}
        </button>
      </div>
    </Modal>
  );
}
export function LocationMappings({ warehouse, onClose, onSaved }: Props) {
  const [mappings, setMappings] = useState(
      warehouse.config.locationMappings || [],
    ),
    [external, setExternal] = useState(""),
    [location, setLocation] = useState(
      generateLayout(warehouse.config).locations[0].id,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const layout = generateLayout(warehouse.config);
  return (
    <Modal title="Map external location IDs" onClose={onClose}>
      <p className="subtle">
        Link an export ID to an exact twin location. CSV imports resolve these
        aliases automatically. SCOTI is not connected yet.
      </p>
      <form
        className="mapping-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            !external.trim() ||
            mappings.some((m) => m.externalId === external.trim())
          ) {
            setError("Enter a unique external ID.");
            return;
          }
          setMappings([
            ...mappings,
            { externalId: external.trim(), locationId: location },
          ]);
          setExternal("");
          setError("");
        }}
      >
        <label>
          External location ID
          <input
            required
            maxLength={100}
            value={external}
            onChange={(e) => setExternal(e.target.value)}
            placeholder="ERP-BIN-001"
          />
        </label>
        <label>
          Twin location
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            {layout.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.zone}
              </option>
            ))}
          </select>
        </label>
        <button className="button small">
          Add mapping
        </button>
      </form>
      <div className="mapping-list">
        {mappings.length ? (
          mappings.map((m) => (
            <div key={m.externalId}>
              <code>{m.externalId}</code>
              <span>→</span>
              <code>{m.locationId}</code>
              <button
                className="text-button danger"
                aria-label={"Remove mapping " + m.externalId}
                onClick={() => setMappings(mappings.filter((x) => x !== m))}
              >
                Remove
              </button>
            </div>
          ))
        ) : (
          <p className="subtle">
            No mappings yet. Twin addresses can be imported directly.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await api<{ warehouse: Warehouse }>(
                "/warehouses/" + warehouse.id,
                "PUT",
                {
                  version: warehouse.version,
                  config: { ...warehouse.config, locationMappings: mappings },
                },
              );
              onSaved(result.warehouse);
              onClose();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Mappings could not be saved.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save mappings"}
        </button>
      </div>
    </Modal>
  );
}
const descriptions: Record<Operation["type"], string> = {
  arrive: "Mark the expected truck as arrived at its assigned dock.",
  receive:
    "Receive all cargo lines into handling units at the selected staging location, then record the inbound truck as departed.",
  putaway: "Move received stock from staging into a storage bin.",
  transfer: "Move stock to another storage bin, preserving SKU and batch.",
  pick: "Allocate stock to a packing station with an order reference.",
  pack: "Complete this packing task and mark its stock ready to load.",
  load: "Load ready stock onto a docked outbound truck. Creates a cargo line and linked handling unit.",
  unload:
    "Return loaded cargo to a packing station and update the truck manifest. The truck and cargo must be released from any holds first.",
  count:
    "Record a physical cycle count. This adjusts the saved quantity, including zero; enter the count reference and reason for the audit trail.",
  dispatch: "Dispatch this truck and the handling units in its manifest.",
  hold: "Pause this record and retain its current status for release.",
  release: "Restore the status this record had before its hold.",
};
export function OperationDialog({
  warehouse,
  record,
  type,
  onClose,
  onSaved,
}: Props & { record: OperationalRecord; type: Operation["type"] }) {
  const moving = [
      "receive",
      "putaway",
      "transfer",
      "pick",
      "load",
      "unload",
    ].includes(type),
    layout = generateLayout(warehouse.config);
  const destinations = layout.locations.filter(
    (l) =>
      l.id !== record.locationId &&
      (type === "receive"
        ? l.zone === "staging"
        : type === "pick" || type === "unload"
          ? l.zone === "packing"
          : type === "load"
            ? l.zone === "outbound" &&
              warehouse.records.some(
                (r) =>
                  r.kind === "Truck" &&
                  r.status === "At dock" &&
                  r.locationId === l.id,
              )
            : l.zone === "storage"),
  );
  const [quantity, setQuantity] = useState(record.quantity),
    [locationId, setLocationId] = useState(destinations[0]?.id || ""),
    [reference, setReference] = useState(
      type === "count" ? "" : record.reference,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={type.charAt(0).toUpperCase() + type.slice(1) + " · " + record.id}
      onClose={onClose}
    >
      <p>{descriptions[type]}</p>
      <div className="operation-context">
        <strong>{record.label}</strong>
        <code>{record.locationId}</code>
        <span>
          {record.quantity} {record.unit || "units"} · {record.status}
        </span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api<{ warehouse: Warehouse }>(
              "/warehouses/" + warehouse.id + "/operations",
              "POST",
              {
                version: warehouse.version,
                operation: {
                  type,
                  recordId: record.id,
                  ...(type === "receive"
                    ? { locationId }
                    : moving
                      ? { quantity, locationId, reference }
                      : type === "count"
                        ? { quantity, reference }
                        : {}),
                },
              },
            );
            onSaved(result.warehouse);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Operation failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {(moving || type === "count") && (
          <div className="field-grid">
            {type !== "receive" && (
              <label>
                Quantity
                <input
                  type="number"
                  min={type === "count" ? 0 : 1}
                  max={type === "count" ? 1000000 : record.quantity}
                  step={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </label>
            )}
            {moving && (
              <label>
                Destination
                <select
                  required
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  {!destinations.length && (
                    <option value="">No eligible destination</option>
                  )}
                  {destinations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {type === "count"
                ? "Count reference / reason"
                : "Order / movement reference"}
              <input
                required={type === "pick" || type === "count"}
                maxLength={80}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
          </div>
        )}
        {type === "dispatch" && (
          <p>
            Verify the manifest before confirming ({record.cargo?.length || 0}{" "}
            cargo lines).
          </p>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button"
            disabled={
              busy ||
              (moving && (!locationId || (type !== "receive" && quantity < 1)))
            }
          >
            {busy ? "Saving…" : "Confirm " + type}
          </button>
        </div>
      </form>
    </Modal>
  );
}
