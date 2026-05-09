import { NextResponse } from "next/server";
import type { ResumeBuilderSectionType } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are a professional resume writer. Improve the provided resume section content to be more impactful, ATS-friendly, and professional. Return ONLY the improved content with no preamble, explanation, or formatting marks. Use strong action verbs and quantified achievements where applicable.";

function buildPrompt(type: ResumeBuilderSectionType, content: string): string {
  switch (type) {
    case "summary":
      return `Improve this professional summary. Make it concise (3–4 sentences), compelling, and keyword-rich. Focus on the candidate's unique value proposition:\n\n${content}`;
    case "experience":
      return `Improve these experience bullet points. Use strong action verbs, quantify achievements where possible (add placeholder numbers if none exist), and remove weak phrases like "responsible for" or "helped with". Keep one bullet per line:\n\n${content}`;
    case "impact":
      return `Improve these key achievement bullets using the CAR (Challenge–Action–Result) framework. Each bullet should be measurable and specific. Keep one bullet per line:\n\n${content}`;
    case "skills":
      return `Clean up and organize this skills list. Remove duplicates, fix formatting inconsistencies, and ensure each skill is on its own line:\n\n${content}`;
    case "recognition":
      return `Improve this awards and recognition section. Make each entry clear, specific, and professionally formatted. Keep one item per line:\n\n${content}`;
    case "education":
      return `Improve this education section entry. Ensure degree, institution, and any relevant honors or focus areas are clearly stated:\n\n${content}`;
    default:
      return `Improve this resume section content. Make it more professional, concise, and impactful:\n\n${content}`;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sectionType?: ResumeBuilderSectionType;
      content?: string;
    };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    const { getActiveProvider } = await import("@/lib/ai/factory");
    const provider = getActiveProvider();
    const prompt = buildPrompt(body.sectionType ?? "custom", body.content);

    const improved = await provider.generateText(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      { maxTokens: 1200 }
    );

    return NextResponse.json({ improved: improved.trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
