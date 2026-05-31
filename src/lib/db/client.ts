import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { migrations } from "./schema";
import { seedDatabaseIfEmpty } from "./seed";

const databasePath = process.env.JST_DATABASE_PATH ?? path.join(process.cwd(), "data", "job-search-terminal.sqlite");

let db: Database.Database | undefined;

export function getDatabase() {
  if (!db) {
    const directory = path.dirname(databasePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }

    db = new Database(databasePath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrateDatabase(db);
    seedDatabaseIfEmpty(db);
  }

  return db;
}

export function migrateDatabase(database = getRawDatabase()) {
  database.exec(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at text not null default current_timestamp
    );
  `);

  const hasMigration = database.prepare("select 1 from schema_migrations where id = ? limit 1");
  const insertMigration = database.prepare("insert into schema_migrations (id) values (?)");

  for (const migration of migrations) {
    if (hasMigration.get(migration.id)) {
      continue;
    }

    const apply = database.transaction(() => {
      database.exec(migration.sql);
      insertMigration.run(migration.id);
    });

    apply();
  }
}

export function getRawDatabase() {
  const directory = path.dirname(databasePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

export function getDatabasePath() {
  return databasePath;
}

/** Close the shared connection before a controlled local restore replaces the database file. */
export function closeDatabase() {
  if (!db) return;
  db.close();
  db = undefined;
}
