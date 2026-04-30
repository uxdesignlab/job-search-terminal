"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { deleteStory, saveStory } from "@/lib/db/queries";

export async function saveStoryAction(formData: FormData) {
  const id = (formData.get("id") as string) || randomUUID();
  const skillsRaw = (formData.get("skills") as string) ?? "";
  const themesRaw = (formData.get("themes") as string) ?? "";

  saveStory({
    id,
    title: (formData.get("title") as string) ?? "",
    situation: (formData.get("situation") as string) ?? "",
    task: (formData.get("task") as string) ?? "",
    action: (formData.get("action") as string) ?? "",
    result: (formData.get("result") as string) ?? "",
    reflection: (formData.get("reflection") as string) ?? "",
    skills: skillsRaw.split(",").map((s) => s.trim()).filter(Boolean),
    themes: themesRaw.split(",").map((s) => s.trim()).filter(Boolean),
    sourceJobId: null,
    sourceBlockF: ""
  });

  revalidatePath("/interview-prep");
}

export async function deleteStoryAction(id: string) {
  deleteStory(id);
  revalidatePath("/interview-prep");
}
