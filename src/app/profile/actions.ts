"use server";

import { revalidatePath } from "next/cache";
import { extractProfileWithAI } from "@/lib/profile/llm-extractor";

export async function extractProfileWithAIAction(): Promise<{ skillCount: number }> {
  const result = await extractProfileWithAI();
  revalidatePath("/profile");
  revalidatePath("/strategy");
  revalidatePath("/dashboard");
  return { skillCount: result.skillCount };
}
