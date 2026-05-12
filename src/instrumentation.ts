export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBrowserBoardFileWatcher } = await import("./lib/scanner/linkedin-file-watcher");
    startBrowserBoardFileWatcher();
  }
}
