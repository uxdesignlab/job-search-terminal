import { mkdirSync } from "node:fs";
import path from "node:path";
import { getRawDatabase, migrateDatabase } from "../src/lib/db/client";

const backupDirectory = path.join(process.cwd(), "output", "backups");
const backupPath = path.join(backupDirectory, `js-backup-${timestamp()}.sqlite`);

mkdirSync(backupDirectory, { recursive: true });

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const database = getRawDatabase();
  migrateDatabase(database);
  await database.backup(backupPath);
  database.close();

  console.log(`SQLite backup written: ${backupPath}`);
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}
