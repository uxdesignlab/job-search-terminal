"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  addTaxonomyAlias,
  archiveTaxonomyConcept,
  archiveUnusedTaxonomyConcepts,
  bulkArchiveTaxonomyConcepts,
  deleteStory,
  mergeTaxonomyConcept,
  promoteTaxonomyConcept,
  removeTaxonomyAlias,
  restoreTaxonomyConcept,
  saveInterviewQuestion,
  saveStory,
  saveTaxonomyConcept,
  setInterviewQuestionActive
} from "@/lib/db/queries";
import type { StoryKind, StoryQualityStatus } from "@/lib/db/types";

function splitList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function coerceStoryKind(value: FormDataEntryValue | null): StoryKind {
  const raw = String(value ?? "");
  if (raw === "answered_question" || raw === "evaluation_suggestion" || raw === "standalone_story") return raw;
  return "standalone_story";
}

function assessQuality(result: string, situation: string, task: string, action: string): { status: StoryQualityStatus; notes: string } {
  if (!result.trim()) {
    return { status: "missing_result", notes: "Add a concrete outcome or impact before using this in an interview." };
  }
  if (!situation.trim() || !task.trim() || !action.trim()) {
    return { status: "needs_detail", notes: "Add missing STAR details before using this in an interview." };
  }
  return { status: "ready", notes: "" };
}

export async function saveStoryAction(formData: FormData) {
  const id = (formData.get("id") as string) || randomUUID();
  const title = (formData.get("title") as string) ?? "";
  const situation = (formData.get("situation") as string) ?? "";
  const task = (formData.get("task") as string) ?? "";
  const action = (formData.get("action") as string) ?? "";
  const result = (formData.get("result") as string) ?? "";
  const quality = assessQuality(result, situation, task, action);

  saveStory({
    id,
    title,
    situation,
    task,
    action,
    result,
    reflection: (formData.get("reflection") as string) ?? "",
    skills: splitList(formData.get("skills")),
    themes: splitList(formData.get("themes")),
    sourceJobId: null,
    sourceBlockF: "",
    storyKind: coerceStoryKind(formData.get("storyKind")),
    questionId: String(formData.get("questionId") ?? "") || null,
    promptText: String(formData.get("promptText") ?? ""),
    qualityStatus: quality.status,
    qualityNotes: quality.notes,
    lastEvaluatedAt: new Date().toISOString()
  });

  revalidatePath("/interview-prep");
}

export async function deleteStoryAction(id: string) {
  deleteStory(id);
  revalidatePath("/interview-prep");
}

export async function saveInterviewQuestionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || randomUUID();
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) return;

  saveInterviewQuestion({
    id,
    prompt,
    category: String(formData.get("category") ?? "").trim() || "General",
    source: String(formData.get("source") ?? "") === "default" ? "default" : "custom",
    active: true
  });

  revalidatePath("/interview-prep");
}

export async function hideInterviewQuestionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  setInterviewQuestionActive(id, false);
  revalidatePath("/interview-prep");
}

export async function saveTaxonomyConceptAction(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  saveTaxonomyConcept({
    id: String(formData.get("id") ?? "") || undefined,
    label,
    parentId: String(formData.get("parentId") ?? "") || null,
    description: String(formData.get("description") ?? "")
  });
  revalidatePath("/interview-prep");
}

export async function archiveTaxonomyConceptAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  archiveTaxonomyConcept(id);
  revalidatePath("/interview-prep");
}

export async function restoreTaxonomyConceptAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  restoreTaxonomyConcept(id);
  revalidatePath("/interview-prep");
}

export async function addTaxonomyAliasAction(formData: FormData) {
  const conceptId = String(formData.get("conceptId") ?? "");
  const rawPhrase = String(formData.get("rawPhrase") ?? "").trim();
  if (!conceptId || !rawPhrase) return;
  addTaxonomyAlias(conceptId, rawPhrase);
  revalidatePath("/interview-prep");
}

export async function removeTaxonomyAliasAction(formData: FormData) {
  const aliasId = String(formData.get("aliasId") ?? "");
  if (!aliasId) return;
  removeTaxonomyAlias(aliasId);
  revalidatePath("/interview-prep");
}

export async function mergeTaxonomyConceptAction(formData: FormData) {
  const sourceId = String(formData.get("sourceId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  if (!sourceId || !targetId || sourceId === targetId) return;
  mergeTaxonomyConcept(sourceId, targetId);
  revalidatePath("/interview-prep");
}

export async function promoteTaxonomyConceptAction(formData: FormData) {
  const ids = splitList(formData.get("ids"));
  const single = String(formData.get("id") ?? "");
  if (single) ids.push(single);
  for (const id of ids) promoteTaxonomyConcept(id);
  revalidatePath("/interview-prep");
}

export async function bulkArchiveTaxonomyConceptsAction(formData: FormData) {
  const ids = splitList(formData.get("ids"));
  const single = String(formData.get("id") ?? "");
  if (single) ids.push(single);
  if (ids.length === 0) return;
  bulkArchiveTaxonomyConcepts(ids);
  revalidatePath("/interview-prep");
}

export async function archiveUnusedTaxonomyConceptsAction() {
  archiveUnusedTaxonomyConcepts();
  revalidatePath("/interview-prep");
}
