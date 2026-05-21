"use server";

import { revalidatePath } from "next/cache";
import { setScanSourceEnabled } from "@/lib/db/queries";

export async function disableScanSource(name: string): Promise<void> {
  if (!name) return;
  setScanSourceEnabled(name, false);
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}
