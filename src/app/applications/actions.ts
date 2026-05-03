"use server";

import { revalidatePath } from "next/cache";
import { updateApplicationNotes, updateApplicationStatus } from "@/lib/db/queries";
import { isApplicationStatus } from "@/lib/applications/status";

export async function moveApplicationAction(jobId: string, newStatus: string) {
  if (!isApplicationStatus(newStatus)) throw new Error(`Invalid status: ${newStatus}`);
  updateApplicationStatus({ jobId, status: newStatus });
  revalidatePath("/applications");
}

export async function closeApplicationAction(jobId: string, outcome: string, note: string) {
  const parts: string[] = [];
  if (outcome && outcome !== "Rejected") parts.push(`Outcome: ${outcome}`);
  if (note.trim()) parts.push(note.trim());
  if (parts.length > 0) {
    updateApplicationNotes(jobId, parts.join("\n"));
  }
  revalidatePath("/applications");
}
