/** Stable keys for persisted table filter presets (SQLite `table_saved_filters`). */
export const TABLE_SAVED_FILTER_STORAGE_KEYS = {
  mainJobs: "jst.dt.savedFilters.mainJobs",
  archivedJobs: "jst.dt.savedFilters.archivedJobs",
  applications: "jst.dt.savedFilters.applications",
  generatedDocs: "jst.dt.savedFilters.generatedDocs",
  scanSources: "jst.dt.savedFilters.scanSources",
  discoveredSources: "jst.dt.savedFilters.discoveredSources",
} as const;

export type TableSavedFilterStorageKey =
  (typeof TABLE_SAVED_FILTER_STORAGE_KEYS)[keyof typeof TABLE_SAVED_FILTER_STORAGE_KEYS];

export const TABLE_SAVED_FILTER_STORAGE_KEY_SET: ReadonlySet<string> = new Set(
  Object.values(TABLE_SAVED_FILTER_STORAGE_KEYS),
);
