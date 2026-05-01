import { getAISettings } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

// Raise body limit to 10 MB so longer recordings don't get rejected.
export const maxDuration = 60;

async function transcribeWithOpenAI(audioFile: File, apiKey: string): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const result = await client.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    language: "en",
    response_format: "text",
  });
  return (result as unknown as string).trim();
}

async function transcribeWithGemini(audioFile: File, apiKey: string, model: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  const arrayBuffer = await audioFile.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = (audioFile.type || "audio/webm") as "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/mpeg" | "audio/wav";

  const result = await genModel.generateContent([
    {
      inlineData: { data: base64, mimeType }
    },
    "Transcribe this audio recording accurately. Return only the spoken words as plain text — no timestamps, labels, or commentary."
  ]);
  return result.response.text().trim();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile || audioFile.size === 0) {
      return Response.json({ error: "No audio received" }, { status: 400 });
    }

    const settings = getAISettings();

    // Build the provider preference list for transcription.
    // Anthropic does not support audio input — skip it and try others.
    type ProviderAttempt = { name: string; fn: () => Promise<string> };
    const attempts: ProviderAttempt[] = [];

    // Active provider first (unless it's Anthropic)
    if (settings.activeProvider === "openai" && settings.openaiApiKey) {
      attempts.push({ name: "OpenAI Whisper", fn: () => transcribeWithOpenAI(audioFile, settings.openaiApiKey) });
    } else if (settings.activeProvider === "gemini" && settings.geminiApiKey) {
      attempts.push({ name: "Gemini", fn: () => transcribeWithGemini(audioFile, settings.geminiApiKey, settings.geminiModel) });
    }

    // Fallbacks — in order of transcription accuracy
    if (!attempts.some((a) => a.name === "OpenAI Whisper") && settings.openaiApiKey) {
      attempts.push({ name: "OpenAI Whisper", fn: () => transcribeWithOpenAI(audioFile, settings.openaiApiKey) });
    }
    if (!attempts.some((a) => a.name === "Gemini") && settings.geminiApiKey) {
      attempts.push({ name: "Gemini", fn: () => transcribeWithGemini(audioFile, settings.geminiApiKey, settings.geminiModel) });
    }

    if (attempts.length === 0) {
      return Response.json(
        {
          error:
            settings.activeProvider === "anthropic"
              ? "Claude does not support audio transcription. Add an OpenAI or Gemini key in Settings → AI Provider to use voice practice."
              : "No API key configured for a provider that supports audio. Add an OpenAI or Gemini key in Settings.",
          unsupported: true,
        },
        { status: 400 }
      );
    }

    let lastError: string = "";
    for (const attempt of attempts) {
      try {
        const transcript = await attempt.fn();
        return Response.json({ transcript, provider: attempt.name });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return Response.json({ error: `Transcription failed: ${lastError}` }, { status: 500 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
