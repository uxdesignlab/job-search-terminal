/** Stable keys for persisted table filter presets (SQLite `table_saved_filters`). */
export const TABLE_SAVED_FILTER_STORAGE_KEYS = {
  mainJobs: "js.dt.savedFilters.mainJobs",
  archivedJobs: "js.dt.savedFilters.archivedJobs",
  applications: "js.dt.savedFilters.applications",
  generatedDocs: "js.dt.savedFilters.generatedDocs",
  scanSources: "js.dt.savedFilters.scanSources",
  discoveredSources: "js.dt.savedFilters.discoveredSources",
} as const;

export type TableSavedFilterStorageKey =
  (typeof TABLE_SAVED_FILTER_STORAGE_KEYS)[keyof typeof TABLE_SAVED_FILTER_STORAGE_KEYS];

export const TABLE_SAVED_FILTER_STORAGE_KEY_SET: ReadonlySet<string> = new Set(
  Object.values(TABLE_SAVED_FILTER_STORAGE_KEYS),
);
