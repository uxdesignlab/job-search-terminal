import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";

export async function polishGapResponse(gapText: string, rawResponse: string): Promise<string> {
  const provider = getActiveProvider();

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a professional resume writer. Your job is to take a candidate's
rough notes about their experience related to a job gap and rewrite them
into a concise, specific, resume-ready statement.

STRICT RULES:
1. Do NOT invent, fabricate, or imply anything not present in the candidate's input.
2. Keep the rewrite to 1-3 sentences maximum.
3. Use action verbs. Be concrete. Include numbers or scale where the candidate provided them.
4. Return only the polished text — no preamble, no explanation.`
    },
    {
      role: "user",
      content: `Gap identified in this job: "${gapText}"

Candidate's notes: "${rawResponse}"

Rewrite as a polished, resume-ready statement that addresses this gap.`
    }
  ];

  const result = await withRetry(() =>
    provider.generateText(messages, { maxTokens: 300 })
  );

  return result.trim();
}
