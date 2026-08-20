import { NextResponse } from "next/server";
import { getAISettings } from "@/lib/db/queries";
import {
  GEMINI_FALLBACK_MODELS,
  GEMINI_LATEST_SENTINELS,
  listGeminiModels,
  pickLatestGemini,
  type GeminiFamily,
} from "@/lib/ai/gemini-models";

/** Gemini's list carries embedding, TTS, image and preview entries alongside the
 *  chat models, and a 100-entry dropdown is unusable — keep the stable text
 *  `gemini-*` ids and drop previews, experiments and dated builds. */
const NON_CHAT = /embedding|aqa|imagen|image|tts|audio|veo|learnlm|gemma/;
const UNSTABLE = /preview|exp|thinking|latest|-\d{3}$/;

function isSelectableChatModel(id: string): boolean {
  return id.startsWith("gemini-") && !NON_CHAT.test(id) && !UNSTABLE.test(id);
}

export async function GET() {
  const settings = getAISettings();
  if (!settings.geminiApiKey) {
    return NextResponse.json({ models: [], latest: {}, error: "No Gemini API key saved yet." });
  }

  try {
    const ids = await listGeminiModels(settings.geminiApiKey, AbortSignal.timeout(10_000));

    const latest: Record<string, string> = {};
    for (const [sentinel, family] of Object.entries(GEMINI_LATEST_SENTINELS)) {
      latest[sentinel] =
        pickLatestGemini(ids, family as GeminiFamily) ?? GEMINI_FALLBACK_MODELS[family as GeminiFamily];
    }

    return NextResponse.json({ models: ids.filter(isSelectableChatModel).sort(), latest });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ models: [], latest: {}, error: msg });
  }
}
