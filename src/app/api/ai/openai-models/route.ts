import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAISettings } from "@/lib/db/queries";
import { OPENAI_FALLBACK_MODEL, pickLatestFlagship } from "@/lib/ai/openai-models";

/** The account's model list also carries image, audio, realtime, transcription and
 *  dated-snapshot entries. None of those can serve a chat completion here, and a
 *  200-entry dropdown is unusable, so keep only undated text `gpt-*` models. */
const NON_CHAT = /image|audio|realtime|transcribe|tts|live|search|embedding|moderation|whisper|codex/;
const DATED_SNAPSHOT = /-\d{4}-\d{2}-\d{2}$/;

function isSelectableChatModel(id: string): boolean {
  return id.startsWith("gpt-") && !NON_CHAT.test(id) && !DATED_SNAPSHOT.test(id);
}

/** Lists the chat models the saved OpenAI key can actually reach, plus which id the
 *  "latest" setting currently resolves to. Uses the stored key — a key typed into the
 *  form but not yet saved will not be used. */
export async function GET() {
  const settings = getAISettings();
  if (!settings.openaiApiKey) {
    return NextResponse.json({ models: [], latest: null, error: "No OpenAI API key saved yet." });
  }

  try {
    const client = new OpenAI({ apiKey: settings.openaiApiKey, timeout: 10_000 });
    const page = await client.models.list();
    const ids = page.data.map((m) => m.id);
    const models = ids.filter(isSelectableChatModel).sort();
    return NextResponse.json({
      models,
      latest: pickLatestFlagship(ids) ?? OPENAI_FALLBACK_MODEL
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ models: [], latest: null, error: msg });
  }
}
