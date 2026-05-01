import { getActiveProvider } from "@/lib/ai/factory";
import type { AIMessage } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { question, transcript } = (await req.json()) as { question: string; transcript: string };
    if (!transcript?.trim()) {
      return Response.json({ error: "No transcript provided" }, { status: 400 });
    }

    const provider = getActiveProvider();

    const messages: AIMessage[] = [
      {
        role: "system",
        content: `You are an interview coach who structures spoken answers into STAR+Reflection format. The user has spoken their answer to an interview question — it is raw, conversational speech with incomplete sentences and filler words. Your job is to:
1. Extract the core story from the transcript
2. Structure it cleanly into STAR + Reflection fields
3. Identify demonstrated skills and themes
4. Keep the person's authentic voice — don't over-polish or add details not mentioned
5. Return ONLY valid JSON, no markdown`
      },
      {
        role: "user",
        content: `Interview question: "${question}"

Spoken answer transcript:
"${transcript}"

Parse this into a JSON object with these fields:
- "title": short memorable label for this story (5–8 words)
- "situation": the context and background (1–3 sentences, cleaned up from speech)
- "task": the candidate's specific responsibility or challenge
- "action": concrete steps they took — preserve specific details mentioned
- "result": outcome or impact — use numbers/specifics if mentioned
- "reflection": what they learned or would do differently (infer from the answer if not explicit)
- "skills": array of 3–6 skill strings demonstrated (e.g. "stakeholder management", "data analysis")
- "themes": array of 2–4 theme strings (e.g. "leadership", "ambiguity", "cross-functional")`
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
    };

    const story = await provider.generateJSON<ParsedStory>(
      messages,
      '{"title":"","situation":"","task":"","action":"","result":"","reflection":"","skills":[],"themes":[]}'
    );

    return Response.json({ story });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
