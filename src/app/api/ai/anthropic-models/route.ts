import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAISettings } from "@/lib/db/queries";
import {
  ANTHROPIC_FALLBACK_MODELS,
  ANTHROPIC_LATEST_SENTINELS,
  pickLatestClaude,
  type ClaudeFamily,
} from "@/lib/ai/anthropic-models";

/** Lists the Claude models the saved key can actually reach, plus what each
 *  "latest-<tier>" sentinel currently resolves to. Uses the stored key — a key
 *  typed into the form but not yet saved will not be used. */
export async function GET() {
  const settings = getAISettings();
  if (!settings.anthropicApiKey) {
    return NextResponse.json({ models: [], latest: {}, error: "No Claude API key saved yet." });
  }

  try {
    const client = new Anthropic({ apiKey: settings.anthropicApiKey, timeout: 10_000 });
    const page = await client.models.list({ limit: 100 });
    const listings = page.data.map((m) => ({ id: m.id, createdAt: m.created_at }));

    const latest: Record<string, string> = {};
    for (const [sentinel, family] of Object.entries(ANTHROPIC_LATEST_SENTINELS)) {
      latest[sentinel] =
        pickLatestClaude(listings, family as ClaudeFamily) ?? ANTHROPIC_FALLBACK_MODELS[family as ClaudeFamily];
    }

    return NextResponse.json({ models: listings.map((m) => m.id).sort(), latest });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ models: [], latest: {}, error: msg });
  }
}
