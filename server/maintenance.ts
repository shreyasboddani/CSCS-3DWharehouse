import { DatabaseSync, backup } from "node:sqlite";
import {
  closeSync,
  openSync,
  copyFileSync,
  constants,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";

export function verifyDatabase(path: string) {
  const db = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    const result = db.prepare("PRAGMA quick_check").all();
    if (result.length !== 1 || Object.values(result[0])[0] !== "ok")
      throw new Error("Database integrity check failed.");
    for (const table of ["tenants", "users", "sessions", "warehouses"])
      if (
        !db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(table)
      )
        throw new Error(
          "Not a Warehouse Twin database: missing " + table + ".",
        );
  } finally {
    db.close();
  }
}
export async function backupDatabase(source: string, target: string) {
  source = resolve(source);
  target = resolve(target);
  if (source === target)
    throw new Error("Backup destination must differ from the source.");
  verifyDatabase(source);
  mkdirSync(dirname(target), { recursive: true });
  // Reserve the destination exclusively. Never replace a previous backup.
  closeSync(openSync(target, "wx", 0o600));
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, target);
    verifyDatabase(target);
  } finally {
    db.close();
  }
  return target;
}
export function restoreDatabase(source: string, target: string) {
  verifyDatabase(source);
  mkdirSync(dirname(resolve(target)), { recursive: true });
  copyFileSync(resolve(source), resolve(target), constants.COPYFILE_EXCL);
  verifyDatabase(target);
  return resolve(target);
}
