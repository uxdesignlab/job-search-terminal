"use server";

import { upsertTableSavedFiltersPayload, getTableSavedFiltersPayload } from "@/lib/db/queries";
import { TABLE_SAVED_FILTER_STORAGE_KEY_SET } from "@/lib/table-saved-filter-storage-keys";

const MAX_PAYLOAD_CHARS = 128_000;

export async function loadTableSavedFiltersAction(tableKey: string): Promise<string | null> {
  if (!TABLE_SAVED_FILTER_STORAGE_KEY_SET.has(tableKey)) {
    return null;
  }
  return getTableSavedFiltersPayload(tableKey);
}

export async function persistTableSavedFiltersAction(tableKey: string, payloadJson: string): Promise<void> {
  if (!TABLE_SAVED_FILTER_STORAGE_KEY_SET.has(tableKey)) {
    throw new Error("Invalid saved-filter key");
  }
  if (payloadJson.length > MAX_PAYLOAD_CHARS) {
    throw new Error("Saved filters payload too large");
  }
  try {
    JSON.parse(payloadJson);
  } catch {
    throw new Error("Invalid saved filters JSON");
  }
  upsertTableSavedFiltersPayload(tableKey, payloadJson);
}
