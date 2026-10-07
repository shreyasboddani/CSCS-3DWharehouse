import { useDeferredValue, useMemo, useState } from "react";
import { searchRecords, searchLocations } from "../domain/search";
import { imageUrlSchema } from "../domain/media";
import type { Layout, OperationalRecord } from "../domain/warehouse";
import { api } from "./service";
import { Icon } from "./ui";

export function ProductPhoto({ url, label }: { url?: string; label: string }) {
  const [failed, setFailed] = useState("");
  const valid = url && imageUrlSchema.safeParse(url).success;
  return (
    <div className="product-photo">
      {valid && failed !== url ? <img src={url} alt={label} loading="lazy" decoding="async"
        referrerPolicy="no-referrer" onError={() => setFailed(url)} /> :
        <span><Icon /><small>{url ? "Photo unavailable" : "No photo added"}</small></span>}
    </div>
  );
}

export function PhotoEditor({ warehouseId, value, onChange, onBusy }: {
  warehouseId: string; value: string; onChange: (url: string) => void; onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function upload(file: File) {
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPG, PNG or WebP photo under 5 MB."); return;
    }
    setBusy(true); onBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const encoded = canvas.toDataURL("image/webp", 0.8);
        const result = await api<{ imageUrl: string }>(`/warehouses/${warehouseId}/images`, "POST", {
          mime: encoded.slice(5, encoded.indexOf(";")), data: encoded.split(",")[1],
        });
        onChange(result.imageUrl);
      } finally { bitmap.close(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Photo upload failed. Try again."); }
    finally { setBusy(false); onBusy(false); }
  }
  return (
    <section className="photo-editor">
      <ProductPhoto url={value} label="Product photo preview" />
      <div>
        <strong>Product photo</strong>
        <p>Upload once. The photo stays with this record as stock moves.</p>
        <label className="button secondary small photo-upload">
          {busy ? "Uploading photo…" : "Choose a photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
        </label>
        <label>Or paste an image link
          <input type="url" value={value.startsWith("/api/") ? "" : value} placeholder="https://…"
            maxLength={2048} onChange={(e) => onChange(e.target.value)} disabled={busy} />
        </label>
        {value && <button type="button" className="text-button" disabled={busy} onClick={() => onChange("")}>Remove photo</button>}
        {error && <p role="alert" className="photo-error">{error}</p>}
      </div>
    </section>
  );
}

/** A small suggestion list replaces a native select with hundreds of thousands of option nodes. */
export function LocationPicker({ layout, value, zones, onChange }: {
  layout: Layout; value: string; zones: string[]; onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const matches = useMemo(() => searchLocations(layout, deferred, zones), [layout, deferred, zones]);
  return <div className="location-picker">
    <span>Location</span>
    <code>{value || "Choose a location"}</code>
    <input type="search" aria-label="Find a record location" placeholder="Search aisle, bin or dock address"
      value={query} onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) { onChange(matches[0].id); setQuery(""); } } }} />
    <details open={query ? true : undefined}>
      <summary>{query ? "Matching locations" : "Choose a different location"}</summary>
      <div className="location-suggestions">
        {matches.map((l) => <button type="button" key={l.id} onClick={() => { onChange(l.id); setQuery(""); }}>
          <strong>{l.code}</strong><small>{l.label}</small>
        </button>)}
        {!matches.length && <p>No matching locations. Try an aisle or dock number.</p>}
      </div>
      <small>Showing the first 20 matches. Type a full address to find any bin.</small>
    </details>
  </div>;
}

export function InventoryExplorer({ records, onInspect, onEdit, onAdd }: {
  records: OperationalRecord[]; onInspect: (record: OperationalRecord) => void;
  onEdit?: (record: OperationalRecord) => void; onAdd?: () => void;
}) {
  const [query, setQuery] = useState(""), [kind, setKind] = useState("Inventory"),
    [status, setStatus] = useState(""), [page, setPage] = useState(0);
  const deferred = useDeferredValue(query);
  const matches = useMemo(() => searchRecords(records, deferred, { kind, status }), [records, deferred, kind, status]);
  const pages = Math.max(1, Math.ceil(matches.length / 24));
  const index = Math.min(page, pages - 1);
  return <section className="inventory-explorer" id="inventory">
    <header><div><span className="eyebrow">INVENTORY WORKSPACE</span><h2>Find it. See it. Go to it.</h2>
      <p>Search a product, SKU, batch or address, then locate it in the warehouse.</p></div>
      {onAdd && <button className="button" onClick={onAdd}><Icon name="plus" /> Add inventory</button>}
    </header>
    <div className="inventory-filters">
      <label className="inventory-search">Search inventory
        <input type="search" value={query} placeholder="Product name, SKU, batch, ID or location"
          onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
      </label>
      <label>Record type<select value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }}>
        <option value="Inventory">Stored inventory</option><option value="Handling unit">Handling units</option>
        <option value="Packing task">Packing tasks</option><option value="">All records</option>
      </select></label>
      <label>Status<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
        <option value="">Any status</option>
        {[...new Set(records.map((r) => r.status))].sort().map((s) => <option key={s}>{s}</option>)}
      </select></label>
    </div>
    <p className="inventory-result-count" aria-live="polite">{matches.length.toLocaleString()} matching records</p>
    <div className="inventory-cards">
      {matches.slice(index * 24, (index + 1) * 24).map((r) => <article key={r.id}>
        <ProductPhoto url={r.imageUrl} label={r.label} />
        <div className="inventory-card-content"><span className={"status " + (r.status === "On hold" ? "warning" : "")}>{r.status}</span>
          <h3>{r.label}</h3><p>{r.sku || r.id}{r.batch ? " · " + r.batch : ""}</p>
          <div className="inventory-card-meta"><strong>{r.quantity.toLocaleString()} <small>{r.unit || "units"}</small></strong><code>{r.locationId}</code></div>
          <div className="inventory-card-actions"><button className="button secondary small" onClick={() => onInspect(r)}>Locate in 3D <Icon name="arrow" /></button>
            {onEdit && <button className="text-button" onClick={() => onEdit(r)}>Edit</button>}</div>
        </div>
      </article>)}
    </div>
    {!matches.length && <div className="inventory-empty"><Icon /><h3>{records.length ? "No products match your search" : "Your inventory starts here"}</h3>
      <p>{records.length ? "Try another SKU, status or record type." : "Add your first record or import a CSV. Photos and locations appear here."}</p></div>}
    {pages > 1 && <nav className="directory-pagination" aria-label="Inventory pages">
      <button className="button secondary small" disabled={!index} onClick={() => setPage(index - 1)}>Previous</button>
      <span>Page {index + 1} of {pages}</span><button className="button secondary small" disabled={index >= pages - 1} onClick={() => setPage(index + 1)}>Next</button>
    </nav>}
  </section>;
}
