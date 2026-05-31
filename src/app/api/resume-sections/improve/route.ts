import { NextResponse } from "next/server";
import type { ResumeBuilderSectionType } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are a truthful professional resume writer. Improve only the provided source content. Never add metrics, tools, domains, credentials, responsibilities, or claims that are not already present. Return ONLY the improved content with no preamble, explanation, or formatting marks.";

function keywordInstruction(jobKeywords: string[]): string {
  if (!jobKeywords.length) return "";
  return `\n\nJob keywords to weave in naturally where they genuinely fit (do not force any that don't belong): ${jobKeywords.join(", ")}.`;
}

function buildPrompt(type: ResumeBuilderSectionType, content: string, jobKeywords: string[]): string {
  const kw = keywordInstruction(jobKeywords);
  switch (type) {
    case "summary":
      return `Improve this professional summary. Make it concise (3–4 sentences), compelling, and keyword-rich. Focus on the candidate's unique value proposition${kw}:\n\n${content}`;
    case "experience":
      return `Improve these experience bullet points. Use strong action verbs, preserve only existing quantified achievements, and remove weak phrases like "responsible for" or "helped with". Keep one bullet per line${kw}:\n\n${content}`;
    case "impact":
      return `Improve these key achievement bullets using the CAR (Challenge–Action–Result) framework. Each bullet should be measurable and specific. Keep one bullet per line${kw}:\n\n${content}`;
    case "skills":
      return `Clean up and organize this skills list. Remove duplicates, fix formatting inconsistencies, and ensure each skill is on its own line${kw}:\n\n${content}`;
    case "recognition":
      return `Improve this awards and recognition section. Make each entry clear, specific, and professionally formatted. Keep one item per line${kw}:\n\n${content}`;
    case "education":
      return `Improve this education section entry. Ensure degree, institution, and any relevant honors or focus areas are clearly stated:\n\n${content}`;
    default:
      return `Improve this resume section content. Make it more professional, concise, and impactful${kw}:\n\n${content}`;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sectionType?: ResumeBuilderSectionType;
      content?: string;
      jobKeywords?: string[];
    };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    const { getActiveProvider } = await import("@/lib/ai/factory");
    const provider = getActiveProvider();
    const prompt = buildPrompt(body.sectionType ?? "custom", body.content, body.jobKeywords ?? []);

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
