import { existsSync, rmSync } from "node:fs";
import { getDatabasePath, getRawDatabase, migrateDatabase } from "../src/lib/db/client";
import { seedDatabase } from "../src/lib/db/seed";

const databasePath = getDatabasePath();

for (const file of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
  if (existsSync(file)) {
    rmSync(file);
  }
}

const database = getRawDatabase();
migrateDatabase(database);
seedDatabase(database);
database.close();

console.log(`Database reset and seeded: ${databasePath}`);
