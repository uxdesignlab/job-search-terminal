import { generateKeywordResumeProposals, type KeywordProposalExperience } from "@/lib/documents/keyword-resume-proposals";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      keyword?: string;
      explanation?: string;
      experiences?: KeywordProposalExperience[];
    };
    const keyword = body.keyword?.trim() ?? "";
    const experiences = (body.experiences ?? []).filter((experience) =>
      Number.isInteger(experience.experienceIndex) &&
      typeof experience.title === "string" &&
      typeof experience.organization === "string" &&
      Array.isArray(experience.bullets) &&
      experience.bullets.every((bullet) => typeof bullet === "string")
    );
    if (!keyword || experiences.length === 0) {
      return Response.json({ error: "Keyword and selected resume experience are required." }, { status: 400 });
    }
    return Response.json({
      proposals: await generateKeywordResumeProposals({
        keyword,
        explanation: body.explanation,
        experiences,
      }),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
