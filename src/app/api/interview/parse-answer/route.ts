import { getActiveProvider } from "@/lib/ai/factory";
import type { AIMessage } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { question, transcript, storyKind } = (await req.json()) as { question?: string; transcript: string; storyKind?: string };
    if (!transcript?.trim()) {
      return Response.json({ error: "No transcript provided" }, { status: 400 });
    }

    const provider = getActiveProvider();
    const hasQuestion = Boolean(question?.trim());

    const messages: AIMessage[] = [
      {
        role: "system",
        content: `You are an interview coach who structures raw interview material into STAR+Reflection format. The user's input may be an answer to a specific interview question or a standalone experience story. It may be raw conversational speech, rough notes, or incomplete sentences. Your job is to:
1. Extract the core story from the transcript
2. Structure it cleanly into STAR + Reflection fields
3. Identify 2-8 ATS-style raw keyword tags actually demonstrated in the story — the same kind of verbatim skill/tool/domain phrases an ATS would scan a job posting for (e.g. "stakeholder management", "Figma", "design systems", "A/B testing", "cross-functional leadership"). These raw keywords will be classified into the user's private local taxonomy later, so precision matters more than breadth — only tag what's genuinely evidenced in the text, don't invent skills that weren't mentioned.
4. Evaluate whether the story is interview-ready
5. Keep the person's authentic voice — don't over-polish or add details not mentioned
6. Return ONLY valid JSON, no markdown`
      },
      {
        role: "user",
        content: `${hasQuestion ? `Interview question: "${question}"` : "No interview question was provided. Treat this as a standalone story for the user's story bank."}
Story kind: "${storyKind ?? (hasQuestion ? "answered_question" : "standalone_story")}"

Raw transcript or notes:
"${transcript}"

Parse this into a JSON object with these fields:
- "title": short memorable label for this story (5–8 words)
- "situation": the context and background (1–3 sentences, cleaned up from speech)
- "task": the candidate's specific responsibility or challenge
- "action": concrete steps they took — preserve specific details mentioned
- "result": outcome or impact — use numbers/specifics if mentioned
- "reflection": what they learned or would do differently (infer from the answer if not explicit)
- "tags": array of 2–8 ATS-style raw keyword phrases genuinely demonstrated in the story (skills, tools, methodologies, domain terms — e.g. "stakeholder management", "Figma", "data analysis", "cross-functional leadership"). Prefer specific terms that can later sit under broader taxonomy groups, such as "user interviews" rather than only "research".
- "qualityStatus": one of "ready", "needs_detail", "missing_result"
- "qualityNotes": one concise coaching note explaining what is missing or why it is ready
- "coachingNotes": array of 1–3 concise suggestions for making this stronger in an interview`
      }
    ];

    type ParsedStory = {
      title: string;
      situation: string;
      task: string;
      action: string;
      result: string;
      reflection: string;
      skills: string[];
      themes: string[];
      tags: string[];
      qualityStatus: "ready" | "needs_detail" | "missing_result";
      qualityNotes: string;
      coachingNotes: string[];
    };

    const story = await provider.generateJSON<ParsedStory>(
      messages,
      '{"title":"","situation":"","task":"","action":"","result":"","reflection":"","skills":[],"themes":[],"tags":[],"qualityStatus":"needs_detail","qualityNotes":"","coachingNotes":[]}'
    );

    return Response.json({ story });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
