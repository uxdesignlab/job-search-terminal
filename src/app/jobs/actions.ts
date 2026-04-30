"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { insertManualJob } from "@/lib/db/queries";
import { evaluateJob } from "@/lib/evaluation/job-evaluator";
import { generateTailoredResume } from "@/lib/documents/resume-generator";

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

  insertManualJob({
    id,
    company,
    title,
    url,
    rawDescription,
    datePosted: date,
    firstSeenDate: date,
  });

  try {
    evaluateJob(id);
    await generateTailoredResume(id);
  } catch (error) {
    console.error("Pipeline failed for manual job", error);
    // Even if evaluation or resume generation fails, the job was inserted.
    // We revalidate and throw so the UI can show an error or partial success.
    revalidatePath("/jobs");
    revalidatePath("/resumes");
    throw error;
  }

  revalidatePath("/jobs");
  revalidatePath("/resumes");
  return { success: true, jobId: id };
}
