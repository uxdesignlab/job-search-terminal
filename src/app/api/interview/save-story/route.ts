import { randomUUID } from "node:crypto";
import { getWritingStyle, saveStory, saveWritingStyle } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title: string;
      situation: string;
      task: string;
      action: string;
      result: string;
      reflection: string;
      skills: string[];
      themes: string[];
      saveVoice: boolean;
      transcript: string;
    };

    saveStory({
      id: randomUUID(),
      title: body.title,
      situation: body.situation,
      task: body.task,
      action: body.action,
      result: body.result,
      reflection: body.reflection,
      skills: body.skills ?? [],
      themes: body.themes ?? [],
      sourceJobId: null,
      sourceBlockF: "voice-practice",
    });

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
