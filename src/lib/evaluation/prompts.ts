import type { JobRecord, RoleDirectionRecord, SkillRecord, UserProfileRecord } from "../db/types";

export type ResumeExcerpt = {
  name: string;
  excerpt: string;
};

export function buildSystemPrompt(
  profile: UserProfileRecord,
  skills: SkillRecord[],
  roleDirections: RoleDirectionRecord[],
  resumeExcerpts?: ResumeExcerpt[]
): string {
  const resumeSection =
    resumeExcerpts && resumeExcerpts.length > 0
      ? `\n\n## Resume Evidence Base\nThese excerpts are the ONLY source of truth for the candidate's actual experience. Every strength, gap, and proof point you cite in CV match and personalization analysis must be grounded in this text.\n\n${resumeExcerpts.map((r) => `### ${r.name} Resume\n${r.excerpt}`).join("\n\n")}`
      : "";

  return `You are a career strategy advisor helping a job seeker make smart application decisions.

Be specific and evidence-based. Never hallucinate skills or experience not in the candidate profile below. Use the actual job history and skill inventory as your sole evidence base.

## Candidate Profile
Name: ${profile.name}
Location: ${profile.location}
Goal: ${profile.currentSearchGoal}
Urgency: ${profile.urgency}
Direction: ${profile.direction}
Career intent: ${profile.careerIntent}
Compensation: ${profile.compensationNeeds || "Not specified"}
Work preferences: ${profile.workPreferences.join(", ") || "Not specified"}
Target roles: ${profile.targetRoles.join(", ") || "Not specified"}
Desired industries: ${profile.desiredIndustries.join(", ") || "Not specified"}
Deal breakers: ${profile.dealBreakers.join(", ") || "None specified"}
Constraints: ${profile.constraints.join(", ") || "None specified"}

## Skill Inventory (${skills.length} skills)
${skills.slice(0, 30).map((s) => `- ${s.skillName} [${s.strengthLevel}] — ${s.evidenceSource}`).join("\n")}

## Role Strategy
${roleDirections.map((r) => `- ${r.roleFamily}: ${r.fitLevel} (${r.score}%) — ${r.rationale}`).join("\n")}${resumeSection}`;
}

export function buildJobContext(job: JobRecord): string {
  const description = (job.rawDescription || job.parsedDescription || "").slice(0, 6000);
  return `## Job Posting
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Remote type: ${job.remoteType}
Posted: ${job.datePosted || job.firstSeenDate}
URL: ${job.url}

${description ? `### Description\n${description}` : "No full description available — only scanner metadata."}`;
}
