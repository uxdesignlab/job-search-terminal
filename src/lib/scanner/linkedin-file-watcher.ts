import { existsSync, mkdirSync, readdirSync, statSync, watch } from "node:fs";
import path from "node:path";
import {
  getBrowserBoardImportDirectory,
  getLinkedInImportDirectory,
  importBrowserBoardJobs
} from "./browser-board-importer";
import {
  getEmailJobAlertImportDirectory,
  importEmailJobAlertFile
} from "./email-job-alert-importer";

const LEGACY_LINKEDIN_FILE_PATTERN = /^linkedin-jobs-.+\.json$/;
const BROWSER_BOARD_FILE_PATTERN = /^(job-board|browser-board|linkedin|wellfound|workatastartup|glassdoor|indeed|monster|adzuna|email|dice)-jobs-.+\.json$/;
export const EMAIL_JOB_ALERT_FILE_PATTERN = /\.(eml|html|txt)$/i;
let started = false;

export function startLinkedInFileWatcher() {
  startBrowserBoardFileWatcher();
}

export function startBrowserBoardFileWatcher() {
  if (started) return;
  started = true;

  watchDirectory(getLinkedInImportDirectory(), LEGACY_LINKEDIN_FILE_PATTERN, "linkedin");
  watchDirectory(getBrowserBoardImportDirectory(), BROWSER_BOARD_FILE_PATTERN);
  watchDirectory(getEmailJobAlertImportDirectory(), EMAIL_JOB_ALERT_FILE_PATTERN, undefined, processEmailFile);
}

async function processFile(filePath: string, legacySource?: "linkedin") {
  try {
    await importBrowserBoardJobs(filePath, legacySource ? { source: legacySource } : {});
  } catch (e) {
    try {
      const { logActivity } = await import("@/lib/db/queries");
      logActivity("browser-board-import", "watcher-error", `File watcher error: ${String(e)}`, {});
    } catch {
      // Ignore secondary logging failure
    }
  }
}

async function processEmailFile(filePath: string) {
  try {
    await importEmailJobAlertFile(filePath);
  } catch (e) {
    try {
      const { logActivity } = await import("@/lib/db/queries");
      logActivity("email-job-alert-import", "watcher-error", `Email file watcher error: ${String(e)}`, { filePath });
    } catch {
      // Ignore secondary logging failure
    }
  }
}

/**
 * Wait until the file size stabilises across two consecutive stat calls ~250ms apart.
 * This guards against reading a file that is still being written directly (i.e. without
 * the recommended .tmp → rename pattern). Returns false if the file disappears or we
 * exhaust all retries without a stable size.
 */
async function waitForFileStable(filePath: string, maxRetries = 4): Promise<boolean> {
  let prevSize = -1;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise<void>((r) => setTimeout(r, 250));
    if (!existsSync(filePath)) return false;
    const size = statSync(filePath).size;
    if (size > 0 && size === prevSize) return true;
    prevSize = size;
  }
  return existsSync(filePath) && statSync(filePath).size === prevSize && prevSize > 0;
}

function watchDirectory(
  watchDir: string,
  filePattern: RegExp,
  legacySource?: "linkedin",
  processor: (filePath: string, legacySource?: "linkedin") => Promise<void> = processFile
) {
  if (!existsSync(watchDir)) mkdirSync(watchDir, { recursive: true });

  // Sweep for files that arrived while the app was stopped so nothing is silently missed.
  for (const filename of readdirSync(watchDir)) {
    if (!filename.endsWith(".tmp") && filePattern.test(filename)) {
      void processor(path.join(watchDir, filename), legacySource);
    }
  }

  const watcher = watch(watchDir, (_, filename) => {
    if (!filename) return;
    if (filename.endsWith(".tmp")) return;
    if (!filePattern.test(filename)) return;

    const filePath = path.join(watchDir, filename);

    void (async () => {
      if (!existsSync(filePath)) return;
      const stable = await waitForFileStable(filePath);
      if (!stable || !existsSync(filePath)) return;
      await processor(filePath, legacySource);
    })();
  });

  watcher.on("error", (err) => {
    console.error("[browser-board-watcher] fs.watch error:", err);
  });
}
