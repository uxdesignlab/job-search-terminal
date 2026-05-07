export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLinkedInFileWatcher } = await import("./lib/scanner/linkedin-file-watcher");
    startLinkedInFileWatcher();
  }
}
