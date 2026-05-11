/** Stable keys for persisted table filter presets (SQLite `table_saved_filters`). */
export const TABLE_SAVED_FILTER_STORAGE_KEYS = {
  mainJobs: "jst.dt.savedFilters.mainJobs",
  archivedJobs: "jst.dt.savedFilters.archivedJobs",
  applications: "jst.dt.savedFilters.applications",
  generatedDocs: "jst.dt.savedFilters.generatedDocs",
  scanSources: "jst.dt.savedFilters.scanSources",
  discoveredSources: "jst.dt.savedFilters.discoveredSources",
} as const;

/** Stable keys for each table's automatically restored last sort/filter state. */
export const TABLE_SORT_FILTER_STATE_STORAGE_KEYS = {
  mainJobs: "jst.dt.state.mainJobs",
  archivedJobs: "jst.dt.state.archivedJobs",
  applications: "jst.dt.state.applications",
  generatedDocs: "jst.dt.state.generatedDocs",
  scanSources: "jst.dt.state.scanSources",
  discoveredSources: "jst.dt.state.discoveredSources",
} as const;

export type TableSavedFilterStorageKey =
  (typeof TABLE_SAVED_FILTER_STORAGE_KEYS)[keyof typeof TABLE_SAVED_FILTER_STORAGE_KEYS];

export type TableSortFilterStateStorageKey =
  (typeof TABLE_SORT_FILTER_STATE_STORAGE_KEYS)[keyof typeof TABLE_SORT_FILTER_STATE_STORAGE_KEYS];

export const TABLE_SAVED_FILTER_STORAGE_KEY_SET: ReadonlySet<string> = new Set(
  [...Object.values(TABLE_SAVED_FILTER_STORAGE_KEYS), ...Object.values(TABLE_SORT_FILTER_STATE_STORAGE_KEYS)],
);
