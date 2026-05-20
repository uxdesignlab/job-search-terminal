"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getJobByUrl, insertManualJob, updateJobDetails } from "@/lib/db/queries";

export async function addManualJobAction(formData: FormData) {
  const company = formData.get("company") as string;
  const title = formData.get("title") as string;
  const url = formData.get("url") as string;
  const rawDescription = formData.get("description") as string;

  if (!company || !title || !rawDescription) {
    throw new Error("Company, title, and description are required.");
  }

  const id = `job-${randomUUID().split("-")[0]}`;
  const date = new Date().toISOString().slice(0, 10);

  const changes = insertManualJob({
    id,
    company,
    title,
    url,
    rawDescription,
    datePosted: date,
    firstSeenDate: date,
  });

  if (changes === 0) {
    // URL already exists — find the existing job and redirect there instead.
    const existing = url ? getJobByUrl(url) : undefined;
    if (existing) {
      revalidatePath("/jobs");
      return { success: true, jobId: existing.id };
    }
    throw new Error("This job could not be saved. A job with the same URL may already exist.");
  }

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return { success: true, jobId: id };
}

export async function editJobAction(
  jobId: string,
  formData: FormData
): Promise<{ success: boolean }> {
  const title = (formData.get("title") as string | null)?.trim() || undefined;
  const company = (formData.get("company") as string | null)?.trim() || undefined;
  const url = (formData.get("url") as string | null)?.trim() || undefined;
  const rawDescription = (formData.get("description") as string | null)?.trim() || undefined;

  updateJobDetails(jobId, { title, company, url, rawDescription });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return { success: true };
}
