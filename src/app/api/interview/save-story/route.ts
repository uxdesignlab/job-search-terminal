import { randomUUID } from "node:crypto";
import { getWritingStyle, saveStory, saveWritingStyle } from "@/lib/db/queries";
import type { StoryKind, StoryQualityStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

function coerceStoryKind(value: unknown): StoryKind {
  if (value === "answered_question" || value === "evaluation_suggestion" || value === "standalone_story") return value;
  return "standalone_story";
}

function coerceQualityStatus(value: unknown, result: string, situation: string, task: string, action: string): StoryQualityStatus {
  if (value === "ready" || value === "needs_detail" || value === "missing_result") return value;
  if (!result.trim()) return "missing_result";
  if (!situation.trim() || !task.trim() || !action.trim()) return "needs_detail";
  return "ready";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      title: string;
      situation: string;
      task: string;
      action: string;
      result: string;
      reflection: string;
      skills: string[];
      themes: string[];
      tags?: string[];
      saveVoice: boolean;
      transcript: string;
      sourceJobId?: string | null;
      sourceBlockF?: string;
      storyKind?: StoryKind;
      questionId?: string | null;
      promptText?: string;
      qualityStatus?: StoryQualityStatus;
      qualityNotes?: string;
      assignedJobIds?: string[];
      skipAutoMatch?: boolean;
    };
    const qualityStatus = coerceQualityStatus(body.qualityStatus, body.result ?? "", body.situation ?? "", body.task ?? "", body.action ?? "");

    saveStory({
      id: body.id || randomUUID(),
      title: body.title,
      situation: body.situation,
      task: body.task,
      action: body.action,
      result: body.result,
      reflection: body.reflection,
      skills: body.skills ?? [],
      themes: body.themes ?? [],
      tags: body.tags ?? [],
      sourceJobId: body.sourceJobId ?? null,
      sourceBlockF: body.sourceBlockF ?? (body.storyKind === "evaluation_suggestion" ? "evaluation" : body.storyKind === "answered_question" ? "voice-practice" : ""),
      storyKind: coerceStoryKind(body.storyKind),
      questionId: body.questionId ?? null,
      promptText: body.promptText ?? "",
      qualityStatus,
      qualityNotes: body.qualityNotes ?? (qualityStatus === "ready" ? "" : "Add missing STAR details before using this in an interview."),
      lastEvaluatedAt: new Date().toISOString(),
      assignedJobIds: Array.isArray(body.assignedJobIds) ? body.assignedJobIds : undefined
    }, { skipAutoMatch: body.skipAutoMatch === true });

    if (body.saveVoice && body.transcript?.trim()) {
      const { extractWritingStyle } = await import("@/lib/profile/writing-style-extractor");
      const existing = getWritingStyle();

      // Combine with existing samples so the style profile accumulates over time
      const samples: string[] = [];
      if (existing.toneProfile) {
        // The stored profile is JSON — we can't re-add it as a sample, so just
        // send the new transcript alongside a note about existing style
        samples.push(body.transcript.trim());
      } else {
        samples.push(body.transcript.trim());
      }

      const profile = await extractWritingStyle(samples);
      saveWritingStyle(JSON.stringify(profile), existing.sampleCount + 1);
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
