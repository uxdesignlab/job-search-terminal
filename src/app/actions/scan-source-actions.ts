"use server";

import { revalidatePath } from "next/cache";
import { setScanSourceEnabled } from "@/lib/db/queries";

export async function disableScanSource(name: string): Promise<void> {
  if (!name) return;
  setScanSourceEnabled(name, false);
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

/** Disables multiple career scan sources (YAML + custom) in one round-trip. */
export async function disableScanSources(names: string[]): Promise<void> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  for (const name of unique) {
    setScanSourceEnabled(name, false);
  }
  if (unique.length > 0) {
    revalidatePath("/dashboard");
    revalidatePath("/settings");
  }
}
