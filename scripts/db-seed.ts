import { getRawDatabase, migrateDatabase, getDatabasePath } from "../src/lib/db/client";
import { seedDatabase } from "../src/lib/db/seed";

const database = getRawDatabase();
migrateDatabase(database);
seedDatabase(database);
database.close();

console.log(`Database seeded: ${getDatabasePath()}`);
