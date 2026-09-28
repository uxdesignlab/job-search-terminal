"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  archiveJob,
  findOtherJobWithSameUrl,
  getJobById,
  getJobByUrl,
  insertManualJob,
  setJobReviewStatus,
  updateJobDetails,
} from "@/lib/db/queries";
import { localDateString } from "@/lib/dates";

export async function addManualJobAction(formData: FormData) {
  const company = formData.get("company") as string;
  const title = formData.get("title") as string;
  const url = formData.get("url") as string;
  const rawDescription = formData.get("description") as string;

  if (!company || !title || !rawDescription) {
    throw new Error("Company, title, and description are required.");
  }

  const id = `job-${randomUUID().split("-")[0]}`;
  const date = localDateString();

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

export async function approveReviewAction(jobId: string) {
  setJobReviewStatus(jobId, "none");
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
}

export async function dismissReviewAction(jobId: string) {
  archiveJob(jobId);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
}

export async function editJobAction(
  jobId: string,
  formData: FormData
): Promise<{ success: true } | { success: false; error: string; duplicateJobId?: string }> {
  const title = (formData.get("title") as string | null)?.trim() || undefined;
  const company = (formData.get("company") as string | null)?.trim() || undefined;
  const url = (formData.get("url") as string | null)?.trim() || undefined;
  const rawDescription = (formData.get("description") as string | null)?.trim() || undefined;

  // Job URLs are unique. Check before writing so a URL that already belongs to
  // another job gets a readable answer instead of a raw SQLite constraint error.
  // Only a changed URL is checked: an unchanged one must never block editing
  // the other fields.
  if (url && url !== getJobById(jobId)?.url) {
    const other = findOtherJobWithSameUrl(url, jobId);
    if (other) {
      return {
        success: false,
        error: `Another job already uses this URL: ${other.title} at ${other.company || "an unnamed company"}. Open that job instead, or archive one of the two.`,
        duplicateJobId: other.id,
      };
    }
  }

  updateJobDetails(jobId, { title, company, url, rawDescription });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return { success: true };
}
