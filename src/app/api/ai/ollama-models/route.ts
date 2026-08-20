import { getAISettings } from "@/lib/db/queries";
import { NextResponse } from "next/server";

/**
 * Embedding and reranking models answer `/v1/models` alongside chat models and
 * cannot serve a generation at all. Offering them in a model picker — especially
 * the one shown after cancelling a slow run — invites a choice that can only fail.
 */
const NOT_A_CHAT_MODEL = /embed|^bge-|minilm|^gte-|^e5-|rerank/i;

type OllamaTag = { name?: string; size?: number };

/**
 * Names the local server can serve, smallest first.
 *
 * Size ordering is the useful one here: the picker exists because a model was too
 * slow, and on the same machine size is the closest proxy for speed there is.
 * `/api/tags` carries the size, `/v1/models` does not, so the native endpoint is
 * tried first and the OpenAI-compatible one is the fallback.
 */
export async function GET() {
  const settings = getAISettings();
  const baseUrl = settings.ollamaBaseUrl || "http://localhost:11434";

  try {
    const tagged = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (tagged.ok) {
      const data = (await tagged.json()) as { models?: OllamaTag[] };
      const models = (data.models ?? [])
        .filter((m) => m.name && !NOT_A_CHAT_MODEL.test(m.name))
        .sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
        .map((m) => m.name as string);
      return NextResponse.json({ models });
    }

    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return NextResponse.json({ models: [], error: `Ollama returned HTTP ${res.status}` });
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const models = (data.data ?? [])
      .map((m) => m.id)
      .filter((id) => !NOT_A_CHAT_MODEL.test(id))
      .sort();
    return NextResponse.json({ models });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const friendly = msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("timeout")
      ? "Ollama is not reachable. Make sure it is running: `ollama serve`"
      : msg;
    return NextResponse.json({ models: [], error: friendly });
  }
}
