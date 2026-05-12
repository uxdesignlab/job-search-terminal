import { existsSync, mkdirSync, watch } from "node:fs";
import path from "node:path";
import {
  getBrowserBoardImportDirectory,
  getLinkedInImportDirectory,
  importBrowserBoardJobs
} from "./browser-board-importer";

const LEGACY_LINKEDIN_FILE_PATTERN = /^linkedin-jobs-.+\.json$/;
const BROWSER_BOARD_FILE_PATTERN = /^(job-board|browser-board|linkedin|wellfound|workatastartup)-jobs-.+\.json$/;
let started = false;

export function startLinkedInFileWatcher() {
  startBrowserBoardFileWatcher();
}

export function startBrowserBoardFileWatcher() {
  if (started) return;
  started = true;

  watchDirectory(getLinkedInImportDirectory(), LEGACY_LINKEDIN_FILE_PATTERN, "linkedin");
  watchDirectory(getBrowserBoardImportDirectory(), BROWSER_BOARD_FILE_PATTERN);
}

function watchDirectory(watchDir: string, filePattern: RegExp, legacySource?: "linkedin") {
  if (!existsSync(watchDir)) mkdirSync(watchDir, { recursive: true });

  const watcher = watch(watchDir, (_, filename) => {
    if (!filename) return;
    if (filename.endsWith(".tmp")) return;
    if (!filePattern.test(filename)) return;

    const filePath = path.join(watchDir, filename);

    // Small delay to let the rename fully complete before reading
    setTimeout(() => {
      void (async () => {
        if (!existsSync(filePath)) return;
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
      })();
    }, 200);
  });

  watcher.on("error", (err) => {
    console.error("[browser-board-watcher] fs.watch error:", err);
  });
}
