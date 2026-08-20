import { NextResponse } from "next/server";
import { getAISettings, saveAISettings } from "@/lib/db/queries";

/**
 * Switch which local model runs, and nothing else.
 *
 * The settings form submits every field at once, which is right for a settings
 * page and wrong for the evaluation modal: someone cancelling a slow run wants to
 * change one thing without their keys and provider order making the round trip.
 */
export async function POST(request: Request) {
  const { model } = (await request.json()) as { model?: string };
  const next = (model ?? "").trim();
  if (!next) return NextResponse.json({ error: "A model name is required." }, { status: 400 });

  const settings = getAISettings();
  saveAISettings({ ...settings, ollamaModel: next });
  return NextResponse.json({ ok: true, model: next });
}
