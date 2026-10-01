import { backupDatabase, restoreDatabase } from "../server/maintenance.ts";
const [action, source, target] = process.argv.slice(2);
if (!source || !target || !["backup", "restore"].includes(action)) {
  console.error(
    "Usage: npm run db:backup -- SOURCE.db NEW_BACKUP.db\n       npm run db:restore -- BACKUP.db NEW_RESTORE.db\nExisting destinations are never overwritten. Switch DB_PATH only after stopping the application and verifying the restored data.",
  );
  process.exitCode = 1;
} else {
  try {
    console.log(
      action === "backup"
        ? await backupDatabase(source, target)
        : restoreDatabase(source, target),
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Database maintenance failed.",
    );
    process.exitCode = 1;
  }
}
