export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBrowserBoardFileWatcher } = await import("./lib/scanner/linkedin-file-watcher");
    const { startJobDiscoveryScheduler } = await import("./lib/scanner/scheduler");
    startBrowserBoardFileWatcher();
    startJobDiscoveryScheduler();
  }
}
