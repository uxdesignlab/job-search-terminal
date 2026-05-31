import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { applyStagedRestore, createAccountBackup, inspectAccountBackup } from "../src/lib/backups/account-backup";
import { migrateDatabase } from "../src/lib/db/client";

async function main() {
const root = mkdtempSync(path.join(os.tmpdir(), "jst-account-backup-check-"));
mkdirSync(path.join(root, "data", "job-board-imports"), { recursive: true });
mkdirSync(path.join(root, "assets"), { recursive: true });
mkdirSync(path.join(root, "output"), { recursive: true });
mkdirSync(path.join(root, "config"), { recursive: true });
writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "test" }));
writeFileSync(path.join(root, "assets", "resume-test.pdf"), "resume-v1");
writeFileSync(path.join(root, "assets", "unrelated-media.mp4"), "media-v1");
writeFileSync(path.join(root, "output", "generated-test.pdf"), "generated-v1");
writeFileSync(path.join(root, "config", "portals.yml"), "tracked_companies: []\n");
writeFileSync(path.join(root, "data", "discovered-sources.json"), '{"entries":[]}');
writeFileSync(path.join(root, "data", "job-board-imports", "scan.json"), '{"jobs":[]}');
writeFileSync(path.join(root, "data", "job-board-imports", "large-scan.json"), Buffer.alloc(8 * 1024 * 1024, "x"));

const databasePath = path.join(root, "data", "job-search-terminal.sqlite");
const database = new Database(databasePath);
migrateDatabase(database);
database.exec("create table backup_check (value text not null); insert into backup_check values ('snapshot-v1')");
database.prepare("insert into resumes (id, name, source_file, status, active_status) values (?, ?, ?, ?, ?)").run(
  "resume-test",
  "Test lane",
  "assets/resume-test.pdf",
  "active",
  1
);
database.close();

const plaintext = await createAccountBackup({ root });
const encrypted = await createAccountBackup({ root, password: "correct horse battery staple" });
if (!plaintext.manifest.files.some((file) => file.path === "files/assets/resume-test.pdf" && file.category === "resume-asset")) {
  throw new Error("Backup did not include the database-referenced resume asset.");
}
if (plaintext.manifest.files.some((file) => file.path.includes("unrelated-media.mp4"))) {
  throw new Error("Backup included an unrelated asset.");
}
await inspectAccountBackup(readFileSync(plaintext.filePath), { root });
try {
  await inspectAccountBackup(readFileSync(encrypted.filePath), { root, password: "wrong" });
  throw new Error("Wrong password should have been rejected");
} catch (error) {
  if (!String(error).includes("incorrect")) throw error;
}

writeFileSync(path.join(root, "assets", "resume-test.pdf"), "resume-mutated");
writeFileSync(path.join(root, "assets", "unrelated-media.mp4"), "media-mutated");
const preview = await inspectAccountBackup(readFileSync(encrypted.filePath), { root, password: "correct horse battery staple" });
await applyStagedRestore(preview.token);
if (readFileSync(path.join(root, "assets", "resume-test.pdf"), "utf8") !== "resume-v1") {
  throw new Error("Restore did not replace managed resume assets.");
}
if (readFileSync(path.join(root, "assets", "unrelated-media.mp4"), "utf8") !== "media-mutated") {
  throw new Error("Restore replaced an unrelated asset.");
}
const restored = new Database(databasePath);
const marker = restored.prepare("select value from backup_check").pluck().get();
restored.close();
if (marker !== "snapshot-v1") throw new Error("Restore did not recover the SQLite snapshot.");
if (readdirSync(path.join(root, "output", "backups")).some((name) => name.startsWith(".account-backup-"))) {
  throw new Error("Backup creation left temporary files behind.");
}
console.log("Account backup check passed: resume-only assets, plaintext, encrypted, wrong-password rejection, and rollback-first restore.");
}

void main();
