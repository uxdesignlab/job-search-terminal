import { getRawDatabase, migrateDatabase, getDatabasePath } from "../src/lib/db/client";

const database = getRawDatabase();
migrateDatabase(database);
database.close();

console.log(`Database migrated: ${getDatabasePath()}`);
