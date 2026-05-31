import path from "node:path";
import { applyStagedRestore, inspectAccountBackupFile } from "../src/lib/backups/account-backup";

async function main() {
  const archivePath = process.argv[2];
  if (!archivePath) throw new Error("Usage: npm run account:restore -- <archive.jst-backup> [--password=...]");
  const passwordArg = process.argv.find((arg) => arg.startsWith("--password="));
  const password = passwordArg?.slice("--password=".length) || undefined;
  const preview = await inspectAccountBackupFile(path.resolve(archivePath), { password });
  const result = await applyStagedRestore(preview.token);
  console.log(`Account restored from: ${archivePath}`);
  console.log(`Rollback backup: ${result.rollbackFilename}`);
}

void main();
