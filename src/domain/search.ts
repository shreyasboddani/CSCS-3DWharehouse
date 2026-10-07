import type { Layout, OperationalRecord } from "./warehouse";

export function searchRecords(records: OperationalRecord[], query: string,
  filters: { kind?: string; status?: string } = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return records.filter((r) => {
    if (filters.kind && r.kind !== filters.kind) return false;
    if (filters.status && r.status !== filters.status) return false;
    const text = [r.id, r.label, r.sku, r.locationId, r.batch, r.reference,
      r.status, r.destination, r.notes, r.cargo?.map((c) => `${c.id} ${c.sku}`).join(" ")]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
export function searchLocations(layout: Layout, query: string, zones: string[], take = 20) {
  const term = query.trim().toLocaleLowerCase();
  const results = [];
  for (const location of layout.locations) {
    if (zones.includes(location.zone) && (location.code + " " + location.label).toLocaleLowerCase().includes(term)) {
      results.push(location);
      if (results.length >= take) break;
    }
  }
  return results;
}
