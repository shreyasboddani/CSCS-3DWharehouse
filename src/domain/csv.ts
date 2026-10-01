import {
  recordSchema,
  validateRecord,
  generateLayout,
  validateRecordSet,
} from "./warehouse";
import type { OperationalRecord, WarehouseConfig } from "./warehouse";
export const csvColumns = [
  "id",
  "kind",
  "label",
  "status",
  "locationId",
  "sku",
  "quantity",
  "unit",
  "batch",
  "reference",
  "destination",
  "scheduledAt",
  "notes",
  "cargo",
  "heldFrom",
  "loadedOnTruckId",
];
export function parseCsv(text: string): string[][] {
  if (text.length > 1000000) throw new Error("CSV files must be under 1 MB.");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (closedQuote && ch !== "," && ch !== "\n" && ch !== "\r")
      throw new Error("Unexpected characters after a quoted CSV field.");
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closedQuote = true;
      } else if (field === "" && !closedQuote) quoted = true;
      else throw new Error("Unexpected quote in CSV.");
    } else if (ch === "," && !quoted) {
      row.push(field);
      field = "";
      closedQuote = false;
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
      closedQuote = false;
    } else field += ch;
  }
  if (quoted) throw new Error("A quoted CSV field was not closed.");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length > 10001)
    throw new Error("CSV imports are limited to 10,000 records.");
  return rows;
}
export function importCsv(
  text: string,
  config: WarehouseConfig,
): { records: OperationalRecord[]; errors: string[] } {
  const rows = parseCsv(text),
    headers = rows.shift()?.map((h) => h.replace(/^\uFEFF/, "").trim()) || [];
  const required = ["id", "kind", "label", "status", "locationId", "quantity"];
  for (const key of required)
    if (!headers.includes(key))
      throw new Error("CSV is missing the " + key + " column.");
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be unique.");
  const records: OperationalRecord[] = [],
    errors: string[] = [],
    seen = new Set<string>();
  const locations = new Map(
      generateLayout(config).locations.map((l) => [l.id, l]),
    ),
    aliases = new Map(
      config.locationMappings?.map((m) => [m.externalId, m.locationId]),
    );
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length !== headers.length) {
      errors.push(
        "Row " + (i + 2) + ": column count does not match the header.",
      );
      continue;
    }
    const raw = Object.fromEntries(
      headers.map((key, index) => [key, cells[index].trim()]),
    );
    const alias = aliases.get(raw.locationId);
    let cargo;
    try {
      cargo = raw.cargo ? JSON.parse(raw.cargo) : undefined;
    } catch {
      errors.push("Row " + (i + 2) + ": cargo must be a JSON array.");
      continue;
    }
    const result = recordSchema.safeParse({
      ...raw,
      cargo,
      heldFrom: raw.heldFrom || undefined,
      loadedOnTruckId: raw.loadedOnTruckId || undefined,
      locationId: alias || raw.locationId,
      sku: raw.sku || "",
      reference: raw.reference || "",
      destination: raw.destination || "",
      scheduledAt: raw.scheduledAt || "",
      notes: raw.notes || "",
      quantity: /^\d+$/.test(raw.quantity) ? Number(raw.quantity) : NaN,
      source: "Imported",
    });
    if (!result.success) {
      errors.push(
        "Row " +
          (i + 2) +
          ": " +
          result.error.issues[0].path.join(".") +
          " " +
          result.error.issues[0].message,
      );
      continue;
    }
    const record = result.data,
      issue = validateRecord(record, config, locations);
    if (issue) errors.push("Row " + (i + 2) + ": " + issue);
    else if (seen.has(record.id))
      errors.push("Row " + (i + 2) + ": duplicate ID " + record.id);
    else {
      records.push(record);
      seen.add(record.id);
    }
  }
  if (!rows.length) throw new Error("CSV has no data rows.");
  const setIssue = validateRecordSet(records, config);
  if (setIssue) errors.push(setIssue);
  return { records, errors };
}
export function exportCsv(records: OperationalRecord[]) {
  const quote = (value: unknown) => {
    const text = String(value ?? "");
    return (
      '"' +
      (/^\s*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
      '"'
    );
  };
  return [
    csvColumns.join(","),
    ...records.map((r) =>
      csvColumns
        .map((key) =>
          quote(
            key === "cargo"
              ? r.cargo?.length
                ? JSON.stringify(r.cargo)
                : ""
              : r[key as keyof OperationalRecord],
          ),
        )
        .join(","),
    ),
  ].join("\r\n");
}
export const sampleCsv =
  csvColumns.join(",") +
  "\nINV-001,Inventory,Example product,In storage,A01-L-B01-L01-01,SKU-001,12,units,BATCH-001,,,,Example row - replace with your own data,,,";
