import { createAccountBackup } from "../src/lib/backups/account-backup";

async function main() {
  const passwordArg = process.argv.find((arg) => arg.startsWith("--password="));
  const password = passwordArg?.slice("--password=".length) || undefined;
  const result = await createAccountBackup({ password });
  console.log(`Account backup created: ${result.filePath}`);
  console.log(`Files: ${result.manifest.files.length}; encrypted: ${result.manifest.encrypted ? "yes" : "no"}`);
}

void main();
