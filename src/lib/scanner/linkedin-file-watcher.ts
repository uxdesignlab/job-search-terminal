import { existsSync, mkdirSync, watch } from "node:fs";
import path from "node:path";
import { getImportDirectory } from "./linkedin-importer";

const FILE_PATTERN = /^linkedin-jobs-.+\.json$/;
let started = false;

export function startLinkedInFileWatcher() {
  if (started) return;
  started = true;

  const watchDir = getImportDirectory();
  if (!existsSync(watchDir)) mkdirSync(watchDir, { recursive: true });

  const watcher = watch(watchDir, (_, filename) => {
    if (!filename) return;
    if (filename.endsWith(".tmp")) return;
    if (!FILE_PATTERN.test(filename)) return;

    const filePath = path.join(watchDir, filename);

    // Small delay to let the rename fully complete before reading
    setTimeout(() => {
      void (async () => {
        if (!existsSync(filePath)) return;
        try {
          const { importLinkedInJobs } = await import("./linkedin-importer");
          await importLinkedInJobs(filePath);
        } catch (e) {
          try {
            const { logActivity } = await import("@/lib/db/queries");
            logActivity("linkedin-import", "watcher-error", `File watcher error: ${String(e)}`, {});
          } catch {
            // Ignore secondary logging failure
          }
        }
      })();
    }, 200);
  });

  watcher.on("error", (err) => {
    console.error("[linkedin-watcher] fs.watch error:", err);
  });
}
