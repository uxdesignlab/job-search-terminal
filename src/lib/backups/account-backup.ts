import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { chmodSync, closeSync, copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import yazl from "yazl";
import yauzl from "yauzl";
import { closeDatabase, getDatabase, getDatabasePath, migrateDatabase } from "@/lib/db/client";
import { migrations } from "@/lib/db/schema";

const MAGIC = Buffer.from("JSTBACKUP1");
const MANIFEST_PATH = "manifest.json";
const DATABASE_ARCHIVE_PATH = "database/job-search-terminal.sqlite";
export const MAX_ACCOUNT_BACKUP_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 1024 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 10_000;
const ENCRYPTION_HEADER_BYTES = MAGIC.length + 16 + 12 + 16;
const FORMAT_VERSION = 1;

type ArchiveCategory = "database" | "resume-asset" | "generated-document" | "config" | "source-state" | "import-history";
type ArchiveSource = { archivePath: string; absolutePath?: string; buffer?: Buffer; category?: ArchiveCategory };

export type AccountBackupManifest = {
  formatVersion: number;
  createdAt: string;
  appVersion: string;
  encrypted: boolean;
  files: Array<{ path: string; category: ArchiveCategory; sizeBytes: number; sha256: string }>;
};

type StagedRestore = {
  token: string;
  root: string;
  password?: string;
  manifest: AccountBackupManifest;
  files: Map<string, string>;
  stageDirectory: string;
  expiresAt: number;
  cleanupTimer?: NodeJS.Timeout;
};

const stagedRestores = new Map<string, StagedRestore>();
let restoreInProgress = false;

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function safeRelative(relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized === "..") {
    throw new Error(`Unsafe archive path: ${relativePath}`);
  }
  return normalized;
}

function managedDestination(archivePath: string, category: ArchiveCategory, resumeAssetPaths: ReadonlySet<string>) {
  if (!archivePath.startsWith("files/")) return null;
  const relative = safeRelative(archivePath.slice("files/".length));
  if (relative === "config/portals.yml" && category === "config") return relative;
  if (relative === "data/discovered-sources.json" && category === "source-state") return relative;
  if (relative.startsWith("data/job-board-imports/") && category === "import-history") return relative;
  if (relative.startsWith("data/linkedin-imports/") && category === "import-history") return relative;
  if (/^output\/[^/]+\.(?:html|pdf)$/i.test(relative) && category === "generated-document") return relative;
  if (relative.startsWith("assets/") && category === "resume-asset" && resumeAssetPaths.has(relative)) return relative;
  throw new Error(`Backup contains an unmanaged path: ${archivePath}`);
}

function resumeAssetPathsFromDatabase(databasePath: string) {
  const database = new Database(databasePath, { readonly: true });
  try {
    return [...new Set((database.prepare("select source_file from resumes where trim(source_file) <> ''").pluck().all() as string[])
      .map((relative) => safeRelative(relative))
      .map((relative) => {
        if (!relative.startsWith("assets/")) {
          throw new Error(`Resume source file must be stored under assets/: ${relative}`);
        }
        return relative;
      }))];
  } finally {
    database.close();
  }
}

function enumerateFiles(root: string, resumeAssetPaths: string[]): Array<{ absolutePath: string; archivePath: string; category: ArchiveCategory }> {
  const output: Array<{ absolutePath: string; archivePath: string; category: ArchiveCategory }> = [];
  const addTree = (relativeDir: string, category: ArchiveCategory, filter: (relative: string) => boolean = () => true) => {
    const absoluteDir = path.join(root, relativeDir);
    if (!existsSync(absoluteDir)) return;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name.startsWith(".")) continue;
        const absolutePath = path.join(dir, name);
        const relative = path.relative(root, absolutePath).replaceAll("\\", "/");
        const stat = statSync(absolutePath);
        if (stat.isDirectory()) walk(absolutePath);
        else if (stat.isFile() && filter(relative)) output.push({ absolutePath, archivePath: `files/${relative}`, category });
      }
    };
    walk(absoluteDir);
  };

  for (const relative of resumeAssetPaths) {
    if (relative.split("/").some((part) => part.startsWith("."))) {
      throw new Error(`Uploaded resume asset cannot use a hidden path: ${relative}`);
    }
    const absolutePath = path.join(root, relative);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      throw new Error(`Uploaded resume asset is missing: ${relative}`);
    }
    output.push({ absolutePath, archivePath: `files/${relative}`, category: "resume-asset" });
  }
  addTree("output", "generated-document", (relative) => /^output\/[^/]+\.(?:html|pdf)$/i.test(relative));
  addTree("data/job-board-imports", "import-history");
  addTree("data/linkedin-imports", "import-history");
  for (const [relative, category] of [
    ["config/portals.yml", "config"],
    ["data/discovered-sources.json", "source-state"],
  ] as const) {
    const absolutePath = path.join(root, relative);
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
      output.push({ absolutePath, archivePath: `files/${relative}`, category });
    }
  }
  return output;
}

function zipToFile(entries: ArchiveSource[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const output = createWriteStream(outputPath, { mode: 0o600 });
    zip.outputStream.on("error", reject);
    output.on("error", reject);
    output.on("close", resolve);
    zip.outputStream.pipe(output);
    for (const entry of entries) {
      const archivePath = safeRelative(entry.archivePath);
      if (entry.buffer) zip.addBuffer(entry.buffer, archivePath);
      else if (entry.absolutePath) zip.addFile(entry.absolutePath, archivePath);
      else throw new Error(`Archive source is missing content: ${archivePath}`);
    }
    zip.end();
  });
}

async function encryptFile(inputPath: string, outputPath: string, password: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encryptedPath = `${outputPath}.encrypted-${randomUUID()}`;
  try {
    await pipeline(createReadStream(inputPath), cipher, createWriteStream(encryptedPath, { mode: 0o600 }));
    const output = createWriteStream(outputPath, { mode: 0o600 });
    output.write(Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag()]));
    await pipeline(createReadStream(encryptedPath), output);
  } finally {
    rmSync(encryptedPath, { force: true });
  }
}

function readHeader(filePath: string, length: number) {
  const descriptor = openSync(filePath, "r");
  try {
    const header = Buffer.alloc(length);
    const bytesRead = readSync(descriptor, header, 0, length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    closeSync(descriptor);
  }
}

async function decryptFile(inputPath: string, outputPath: string, password?: string) {
  const header = readHeader(inputPath, ENCRYPTION_HEADER_BYTES);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    copyFileSync(inputPath, outputPath);
    return;
  }
  if (!password) throw new Error("This backup is password protected.");
  if (header.length < ENCRYPTION_HEADER_BYTES) throw new Error("The encrypted backup header is incomplete.");
  const salt = header.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = header.subarray(MAGIC.length + 16, MAGIC.length + 28);
  const tag = header.subarray(MAGIC.length + 28, ENCRYPTION_HEADER_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(inputPath, { start: ENCRYPTION_HEADER_BYTES }),
      decipher,
      createWriteStream(outputPath, { mode: 0o600 })
    );
  } catch {
    rmSync(outputPath, { force: true });
    throw new Error("The backup password is incorrect or the encrypted archive is corrupt.");
  }
}

function safeStagedPath(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, safeRelative(relativePath));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe archive path: ${relativePath}`);
  }
  return resolved;
}

function unzipToDirectory(zipPath: string, outputDirectory: string): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error("Could not read backup archive."));
      const files = new Map<string, string>();
      let expandedBytes = 0;
      let entryCount = 0;
      let settled = false;
      const fail = (reason: unknown) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(reason);
      };
      zip.readEntry();
      zip.on("entry", (entry) => {
        try {
          const archivePath = safeRelative(entry.fileName);
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (mode === 0o120000) throw new Error(`Symbolic links are not allowed in backups: ${archivePath}`);
          if (++entryCount > MAX_ARCHIVE_FILES) throw new Error("Backup archive contains too many files.");
          if (files.has(archivePath)) throw new Error(`Backup archive contains a duplicate path: ${archivePath}`);
          const destination = safeStagedPath(outputDirectory, archivePath);
          if (/\/$/.test(archivePath)) {
            mkdirSync(destination, { recursive: true });
            return zip.readEntry();
          }
          mkdirSync(path.dirname(destination), { recursive: true });
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return fail(streamError ?? new Error(`Could not read ${archivePath}`));
            const limiter = new Transform({
              transform(chunk: Buffer, _, callback) {
                expandedBytes += chunk.length;
                callback(
                  expandedBytes > MAX_EXPANDED_BYTES ? new Error("Backup archive expands beyond the 1 GB safety limit.") : null,
                  chunk
                );
              }
            });
            void pipeline(stream, limiter, createWriteStream(destination, { mode: 0o600 }))
              .then(() => {
              files.set(archivePath, destination);
              zip.readEntry();
              })
              .catch(fail);
          });
        } catch (entryError) {
          fail(entryError);
        }
      });
      zip.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(files);
      });
      zip.on("error", fail);
    });
  });
}

function packageVersion(root: string) {
  try {
    return (JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function createAccountBackup(options: { password?: string; root?: string; outputDirectory?: string } = {}) {
  const root = options.root ?? process.cwd();
  const backupDirectory = options.outputDirectory ?? path.join(root, "output", "backups");
  mkdirSync(backupDirectory, { recursive: true });
  const temporaryDatabase = path.join(backupDirectory, `.account-backup-${randomUUID()}.sqlite`);
  const temporaryZip = path.join(backupDirectory, `.account-backup-${randomUUID()}.zip`);
  const databasePath = root === process.cwd() ? getDatabasePath() : path.join(root, "data", "job-search-terminal.sqlite");
  const database = new Database(databasePath);
  await database.backup(temporaryDatabase);
  database.close();

  try {
    const managed = enumerateFiles(root, resumeAssetPathsFromDatabase(temporaryDatabase));
    const archiveFiles: Array<Required<Pick<ArchiveSource, "absolutePath" | "archivePath" | "category">>> = [
      { archivePath: DATABASE_ARCHIVE_PATH, absolutePath: temporaryDatabase, category: "database" },
      ...managed,
    ];
    const manifest: AccountBackupManifest = {
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      appVersion: packageVersion(root),
      encrypted: Boolean(options.password),
      files: await Promise.all(archiveFiles.map(async (file) => ({
        path: file.archivePath,
        category: file.category,
        sizeBytes: statSync(file.absolutePath).size,
        sha256: await sha256File(file.absolutePath),
      }))),
    };
    await zipToFile([{ archivePath: MANIFEST_PATH, buffer: Buffer.from(JSON.stringify(manifest, null, 2)) }, ...archiveFiles], temporaryZip);
    const filename = `job-search-terminal-account-${manifest.createdAt.replaceAll(":", "-").replace(/\..+/, "Z")}-${randomUUID().slice(0, 8)}.jst-backup`;
    const filePath = path.join(backupDirectory, filename);
    if (options.password) await encryptFile(temporaryZip, filePath, options.password);
    else {
      copyFileSync(temporaryZip, filePath);
      chmodSync(filePath, 0o600);
    }
    return { filename, filePath, manifest, sizeBytes: statSync(filePath).size };
  } finally {
    rmSync(temporaryDatabase, { force: true });
    rmSync(`${temporaryDatabase}-wal`, { force: true });
    rmSync(`${temporaryDatabase}-shm`, { force: true });
    rmSync(temporaryZip, { force: true });
  }
}

function discardStagedRestore(staged: StagedRestore) {
  if (staged.cleanupTimer) clearTimeout(staged.cleanupTimer);
  rmSync(staged.stageDirectory, { recursive: true, force: true });
}

function pruneExpiredStagedRestores() {
  for (const [token, staged] of stagedRestores) {
    if (staged.expiresAt >= Date.now()) continue;
    stagedRestores.delete(token);
    discardStagedRestore(staged);
  }
}

function validateIncomingDatabase(databasePath: string) {
  const probe = new Database(databasePath, { readonly: true });
  try {
    const integrity = probe.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error("The restored database failed SQLite integrity validation.");
    const knownMigrations = new Set(migrations.map((migration) => migration.id));
    const appliedMigrations = probe.prepare("select id from schema_migrations").pluck().all() as string[];
    if (appliedMigrations.some((migration) => !knownMigrations.has(migration))) {
      throw new Error("This backup was created by a newer app schema. Upgrade Job Search Terminal before restoring it.");
    }
  } finally {
    probe.close();
  }
  return new Set(resumeAssetPathsFromDatabase(databasePath));
}

function validateManifest(manifest: AccountBackupManifest, files: Map<string, string>) {
  if (manifest.formatVersion !== FORMAT_VERSION) throw new Error("This backup was created by an incompatible app version.");
  const expectedPaths = new Set([MANIFEST_PATH]);
  const databaseEntries = manifest.files.filter((file) => file.path === DATABASE_ARCHIVE_PATH && file.category === "database");
  if (databaseEntries.length !== 1) throw new Error("Backup manifest must contain one database snapshot.");
  for (const file of manifest.files) {
    const archivePath = safeRelative(file.path);
    if (expectedPaths.has(archivePath)) throw new Error(`Backup manifest contains a duplicate path: ${archivePath}`);
    expectedPaths.add(archivePath);
    const stagedPath = files.get(archivePath);
    if (!stagedPath || statSync(stagedPath).size !== file.sizeBytes) {
      throw new Error(`Backup checksum validation failed for ${file.path}.`);
    }
  }
  if (files.size !== expectedPaths.size || [...files.keys()].some((filePath) => !expectedPaths.has(filePath))) {
    throw new Error("Backup archive contains files that are not listed in its manifest.");
  }
}

async function validateStagedRestore(files: Map<string, string>) {
  const manifestPath = files.get(MANIFEST_PATH);
  if (!manifestPath) throw new Error("Backup manifest is missing.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AccountBackupManifest;
  validateManifest(manifest, files);
  for (const file of manifest.files) {
    const stagedPath = files.get(file.path)!;
    if (await sha256File(stagedPath) !== file.sha256) {
      throw new Error(`Backup checksum validation failed for ${file.path}.`);
    }
  }
  const databasePath = files.get(DATABASE_ARCHIVE_PATH);
  if (!databasePath) throw new Error("Backup database snapshot is missing.");
  const resumeAssetPaths = validateIncomingDatabase(databasePath);
  for (const file of manifest.files) {
    if (file.path === DATABASE_ARCHIVE_PATH) continue;
    managedDestination(file.path, file.category, resumeAssetPaths);
  }
  for (const resumeAssetPath of resumeAssetPaths) {
    const archivePath = `files/${resumeAssetPath}`;
    const manifestFile = manifest.files.find((file) => file.path === archivePath);
    if (!manifestFile || manifestFile.category !== "resume-asset") {
      throw new Error(`Backup is missing referenced resume asset: ${resumeAssetPath}`);
    }
  }
  return manifest;
}

export async function inspectAccountBackupFile(archivePath: string, options: { password?: string; root?: string } = {}) {
  if (statSync(archivePath).size > MAX_ACCOUNT_BACKUP_ARCHIVE_BYTES) throw new Error("Backup archive is larger than the 1 GB safety limit.");
  pruneExpiredStagedRestores();
  const root = options.root ?? process.cwd();
  const stageDirectory = path.join(root, "output", "backups", `.account-restore-${randomUUID()}`);
  const extractedDirectory = path.join(stageDirectory, "extracted");
  const zipPath = path.join(stageDirectory, "payload.zip");
  mkdirSync(extractedDirectory, { recursive: true });
  try {
    await decryptFile(archivePath, zipPath, options.password);
    if (statSync(zipPath).size > MAX_ACCOUNT_BACKUP_ARCHIVE_BYTES) throw new Error("Decrypted backup archive is larger than the 1 GB safety limit.");
    const files = await unzipToDirectory(zipPath, extractedDirectory);
    const manifest = await validateStagedRestore(files);
    const token = randomUUID();
    const staged: StagedRestore = {
      token,
      root,
      password: options.password,
      manifest,
      files,
      stageDirectory,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    staged.cleanupTimer = setTimeout(() => {
      if (stagedRestores.delete(token)) discardStagedRestore(staged);
    }, 15 * 60 * 1000);
    staged.cleanupTimer.unref();
    stagedRestores.set(token, staged);
    return { token, manifest };
  } catch (error) {
    rmSync(stageDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function inspectAccountBackup(archive: Buffer, options: { password?: string; root?: string } = {}) {
  if (archive.length > MAX_ACCOUNT_BACKUP_ARCHIVE_BYTES) throw new Error("Backup archive is larger than the 1 GB safety limit.");
  const root = options.root ?? process.cwd();
  const uploadPath = path.join(root, "output", "backups", `.account-upload-${randomUUID()}.jst-backup`);
  mkdirSync(path.dirname(uploadPath), { recursive: true });
  writeFileSync(uploadPath, archive, { mode: 0o600 });
  try {
    return await inspectAccountBackupFile(uploadPath, options);
  } finally {
    rmSync(uploadPath, { force: true });
  }
}

function copyPreparedManagedFiles(staged: StagedRestore, preparedRoot: string, resumeAssetPaths: ReadonlySet<string>) {
  for (const file of staged.manifest.files) {
    if (file.path === DATABASE_ARCHIVE_PATH) continue;
    const relative = managedDestination(file.path, file.category, resumeAssetPaths);
    if (!relative) continue;
    const destination = path.join(preparedRoot, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(staged.files.get(file.path)!, destination);
    chmodSync(destination, 0o600);
  }
}

function topLevelGeneratedOutputs(root: string) {
  const outputPath = path.join(root, "output");
  return new Set(
    (existsSync(outputPath) ? readdirSync(outputPath, { withFileTypes: true }) : [])
      .filter((entry) => entry.isFile() && /\.(?:html|pdf)$/i.test(entry.name))
      .map((entry) => `output/${entry.name}`)
  );
}

function swapManagedPaths(root: string, preparedRoot: string, rollbackRoot: string, relativePaths: string[]) {
  const swapped: Array<{ active: string; rollback: string }> = [];
  try {
    for (const relative of relativePaths) {
      const active = path.join(root, relative);
      const incoming = path.join(preparedRoot, relative);
      const rollback = path.join(rollbackRoot, relative);
      if (!existsSync(active) && !existsSync(incoming)) continue;
      mkdirSync(path.dirname(rollback), { recursive: true });
      if (existsSync(active)) renameSync(active, rollback);
      swapped.push({ active, rollback });
      if (existsSync(incoming)) {
        mkdirSync(path.dirname(active), { recursive: true });
        renameSync(incoming, active);
      }
    }
  } catch (error) {
    for (const { active, rollback } of swapped.reverse()) {
      rmSync(active, { recursive: true, force: true });
      if (existsSync(rollback)) {
        mkdirSync(path.dirname(active), { recursive: true });
        renameSync(rollback, active);
      }
    }
    throw error;
  }
}

function replaceManagedFiles(staged: StagedRestore, preparedRoot: string, activeDatabasePath: string, currentResumeAssets: string[], restoredResumeAssets: ReadonlySet<string>) {
  const currentOutputs = topLevelGeneratedOutputs(staged.root);
  const restoredOutputs = topLevelGeneratedOutputs(preparedRoot);
  const relativePaths = [
    path.relative(staged.root, activeDatabasePath),
    "config/portals.yml",
    "data/discovered-sources.json",
    "data/job-board-imports",
    "data/linkedin-imports",
    ...new Set([...currentResumeAssets, ...restoredResumeAssets]),
    ...new Set([...currentOutputs, ...restoredOutputs]),
  ];
  const rollbackRoot = path.join(staged.stageDirectory, "rollback");
  swapManagedPaths(staged.root, preparedRoot, rollbackRoot, relativePaths);
}

export async function applyStagedRestore(token: string) {
  if (restoreInProgress) throw new Error("Another restore is already in progress.");
  restoreInProgress = true;
  try {
    pruneExpiredStagedRestores();
    const staged = stagedRestores.get(token);
    if (!staged) throw new Error("Restore preview expired. Inspect the archive again.");
    const rollback = await createAccountBackup({ password: staged.password, root: staged.root });
    const activeDatabasePath = staged.root === process.cwd() ? getDatabasePath() : path.join(staged.root, "data", "job-search-terminal.sqlite");
    const currentResumeAssets = resumeAssetPathsFromDatabase(activeDatabasePath);
    const preparedRoot = path.join(staged.stageDirectory, "prepared");
    const preparedDatabasePath = path.join(preparedRoot, path.relative(staged.root, activeDatabasePath));
    mkdirSync(path.dirname(preparedDatabasePath), { recursive: true });
    copyFileSync(staged.files.get(DATABASE_ARCHIVE_PATH)!, preparedDatabasePath);
    const probe = new Database(preparedDatabasePath);
    try {
      migrateDatabase(probe);
    } finally {
      probe.close();
    }
    const restoredResumeAssets = validateIncomingDatabase(preparedDatabasePath);
    copyPreparedManagedFiles(staged, preparedRoot, restoredResumeAssets);

    if (staged.root === process.cwd()) closeDatabase();
    rmSync(`${activeDatabasePath}-wal`, { force: true });
    rmSync(`${activeDatabasePath}-shm`, { force: true });
    try {
      replaceManagedFiles(staged, preparedRoot, activeDatabasePath, currentResumeAssets, restoredResumeAssets);
    } finally {
      if (staged.root === process.cwd()) getDatabase();
    }
    stagedRestores.delete(token);
    discardStagedRestore(staged);
    return { rollbackFilename: rollback.filename };
  } finally {
    restoreInProgress = false;
  }
}
