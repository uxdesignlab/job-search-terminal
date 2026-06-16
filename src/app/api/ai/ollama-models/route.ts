import { getAISettings } from "@/lib/db/queries";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const settings = getAISettings();
    const baseUrl = settings.ollamaBaseUrl || "http://localhost:11434";
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return NextResponse.json({ models: [], error: `Ollama returned HTTP ${res.status}` });
    }
    const data = await res.json() as { data?: { id: string }[] };
    const models = (data.data ?? []).map((m) => m.id).sort();
    return NextResponse.json({ models });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const friendly = msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("timeout")
      ? "Ollama is not reachable. Make sure it is running: `ollama serve`"
      : msg;
    return NextResponse.json({ models: [], error: friendly });
  }
}
