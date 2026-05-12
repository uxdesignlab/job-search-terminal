import {
  ensureBrowserBoardImportDirectories,
  getLinkedInImportDirectory,
  importBrowserBoardJobs
} from "./browser-board-importer";

export async function importLinkedInJobs(jsonFilePath: string) {
  return importBrowserBoardJobs(jsonFilePath, { source: "linkedin" });
}

export function getImportDirectory(): string {
  return getLinkedInImportDirectory();
}

export function ensureImportDirectory(): void {
  ensureBrowserBoardImportDirectories();
}
