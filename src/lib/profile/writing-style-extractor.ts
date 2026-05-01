import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";

export type WritingStyleProfile = {
  tone: string;
  formality: string;
  sentenceStyle: string;
  vocabularyLevel: string;
  rhetoricalPatterns: string[];
  thingsToAvoid: string[];
  styleGuide: string;
};

export async function extractWritingStyle(samples: string[]): Promise<WritingStyleProfile> {
  const provider = getActiveProvider();

  const combinedSamples = samples
    .map((s, i) => `--- Sample ${i + 1} ---\n${s.trim()}`)
    .join("\n\n");

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a writing coach and linguist. Analyze writing samples to extract the author's unique voice and style. Return ONLY valid JSON — no markdown, no explanation.`
    },
    {
      role: "user",
      content: `Analyze the following writing samples and extract the author's personal writing style.

${combinedSamples}

Return a JSON object with:
- "tone": describe the overall emotional tone in 5-10 words (e.g., "confident, direct, occasionally self-deprecating")
- "formality": "formal" | "semi-formal" | "conversational" | "casual"
- "sentenceStyle": describe sentence structure tendencies (e.g., "short punchy sentences mixed with longer elaborations")
- "vocabularyLevel": "technical" | "plain" | "varied" | "jargon-heavy"
- "rhetoricalPatterns": up to 5 strings — specific patterns this person uses (e.g., "opens with concrete examples", "uses questions to engage reader")
- "thingsToAvoid": up to 4 strings — phrases, structures, or patterns absent from their writing that would feel unnatural
- "styleGuide": 2-3 sentence summary of how to write content that sounds like this person`
    }
  ];

  return withRetry(() =>
    provider.generateJSON<WritingStyleProfile>(messages, '{"tone":"","formality":"","sentenceStyle":"","vocabularyLevel":"","rhetoricalPatterns":[],"thingsToAvoid":[],"styleGuide":""}')
  );
}

export function formatStyleForPrompt(toneProfile: string): string {
  if (!toneProfile) return "";
  try {
    const profile = JSON.parse(toneProfile) as WritingStyleProfile;
    return `
CANDIDATE WRITING STYLE (match this voice in all generated content):
- Tone: ${profile.tone}
- Formality: ${profile.formality}
- Sentence style: ${profile.sentenceStyle}
- Vocabulary: ${profile.vocabularyLevel}
- Their patterns: ${profile.rhetoricalPatterns.join("; ")}
- Avoid: ${profile.thingsToAvoid.join("; ")}
- Style guide: ${profile.styleGuide}`.trim();
  } catch {
    return toneProfile ? `Writing style guidance: ${toneProfile}` : "";
  }
}
