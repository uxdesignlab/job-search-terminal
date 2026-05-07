import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { getJobDedupKeys, insertLinkedInJobs, logActivity, recordScanRun } from "@/lib/db/queries";
import type { ImportResult, LinkedInScanFile } from "@/lib/db/types";

const ARCHIVE_BASE = path.join(process.cwd(), "data", "linkedin-imports", "archive");

function stableId(url: string): string {
  return `li-${createHash("sha1").update(url).digest("hex").slice(0, 16)}`;
}

export async function importLinkedInJobs(jsonFilePath: string): Promise<ImportResult> {
  const scanRunId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  // Parse and validate JSON
  let parsed: LinkedInScanFile;
  try {
    parsed = JSON.parse(readFileSync(jsonFilePath, "utf-8")) as LinkedInScanFile;
  } catch (e) {
    return {
      success: false,
      imported: 0,
      duplicates: 0,
      errors: [String(e)],
      summary: "Failed to parse JSON file.",
      jobIds: [],
      scanRunId
    };
  }

  if (!parsed.metadata || !Array.isArray(parsed.jobs)) {
    return {
      success: false,
      imported: 0,
      duplicates: 0,
      errors: ["Invalid file structure: missing metadata or jobs array."],
      summary: "Invalid file structure.",
      jobIds: [],
      scanRunId
    };
  }

  // Load existing dedup keys from DB
  const dedup = getJobDedupKeys();
  const jobsToInsert = [];
  let skipped = 0;
  let duplicateCount = 0;

  for (const raw of parsed.jobs) {
    if (!raw.company || !raw.position || !raw.url) {
      skipped++;
      continue;
    }

    const company = raw.company.trim();
    const title = raw.position.trim();
    const url = raw.url.trim();
    const location = (raw.location ?? "Not specified").trim();
    const companyRoleKey = `${company.toLowerCase()}::${title.toLowerCase()}`;

    let isDuplicate = false;

    if (dedup.urls.has(url)) {
      isDuplicate = true;
      duplicateCount++;
    } else if (dedup.companyRoles.has(companyRoleKey)) {
      isDuplicate = true;
      duplicateCount++;
    } else {
      // Add to in-memory set to catch within-batch dupes
      dedup.urls.add(url);
      dedup.companyRoles.add(companyRoleKey);
    }

    const firstSeenDate = raw.discoveredAt
      ? raw.discoveredAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    jobsToInsert.push({
      id: stableId(url),
      company,
      title,
      url,
      location,
      rawDescription: (raw.jobDescription ?? "").trim(),
      datePosted: null,
      firstSeenDate,
      isDuplicate,
      duplicateOf: null
    });
  }

  // Insert all jobs in a single transaction
  const { inserted, jobIds } = insertLinkedInJobs(jobsToInsert);

  // Archive the source file
  const today = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(ARCHIVE_BASE, today);
  try {
    mkdirSync(archiveDir, { recursive: true });
    const dest = path.join(archiveDir, path.basename(jsonFilePath));
    try {
      renameSync(jsonFilePath, dest);
    } catch {
      // Cross-device move fallback
      copyFileSync(jsonFilePath, dest);
      unlinkSync(jsonFilePath);
    }
  } catch (e) {
    errors.push(`Archive failed (file left in place): ${String(e)}`);
  }

  // Record the scan run
  const completedAt = new Date().toISOString();
  recordScanRun({
    id: scanRunId,
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    startedAt,
    completedAt,
    companiesScanned: 0,
    skippedCompanies: 0,
    totalJobsFound: parsed.metadata.totalJobsDiscovered,
    filteredCount: skipped,
    duplicateCount,
    newJobsCount: inserted,
    errors: errors.map((e) => ({ company: "linkedin", error: e })),
    scanType: "linkedin-claude-scan"
  });

  logActivity(
    "linkedin-import",
    scanRunId,
    `LinkedIn scan imported ${inserted} new jobs (${duplicateCount} duplicates)`,
    { inserted, duplicateCount, skipped }
  );

  const s = inserted !== 1 ? "s" : "";
  const ds = duplicateCount !== 1 ? "s" : "";
  const summary = `✓ Imported ${inserted} job${s}. ${duplicateCount} duplicate${ds} detected.`;

  return { success: true, imported: inserted, duplicates: duplicateCount, errors, summary, jobIds, scanRunId };
}

export function getImportDirectory(): string {
  return path.join(process.cwd(), "data", "linkedin-imports");
}

export function ensureImportDirectory(): void {
  const dir = getImportDirectory();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
