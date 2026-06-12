import { getActiveProvider } from "@/lib/ai/factory";
import { withRetry } from "@/lib/ai/retry";
import type { AIMessage } from "@/lib/ai/provider";
import type { SkillRecord, UserProfileRecord } from "@/lib/db/types";

export type GeneratedRoleDirection = {
  id: string;
  roleFamily: string;
  fitLevel: "Direct" | "Adjacent" | "Selective" | "Avoid";
  score: number;
  rationale: string;
  gaps: string[];
  recommendationType: string;
};

export async function generateRoleDirections(
  profile: UserProfileRecord,
  skills: SkillRecord[],
): Promise<GeneratedRoleDirection[]> {
  const provider = getActiveProvider();

  const skillLines = skills
    .slice(0, 25)
    .map((s) => `${s.skillName} (${s.strengthLevel}; prefer: ${s.usePreference})`)
    .join(", ");

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a career strategist generating a role-fit map for a job seeker.

Given the candidate's profile and skills, produce 4–6 role direction entries that cover the realistic range of archetypes they could pursue.

Fit level definitions:
- Direct: Strong natural match — apply confidently (score 80–100)
- Adjacent: Good overlap — worth pursuing with careful framing (score 60–79)
- Selective: Partial match — apply only when fit score is 80+ (score 40–59)
- Avoid: Low alignment — skip by default (score 0–39)

Return ONLY a valid JSON array. Each object must have exactly these keys:
  id           — kebab-case slug unique within the array (e.g., "head-of-design")
  roleFamily   — human-readable archetype name (e.g., "Head of Design")
  fitLevel     — one of: "Direct", "Adjacent", "Selective", "Avoid"
  score        — integer 0–100 consistent with fitLevel band
  rationale    — 1–2 sentences grounded in the candidate's actual stated background
  gaps         — array of 0–3 specific gaps or things to address (empty array if none)
  recommendationType — "apply" for Direct, "consider" for Adjacent/Selective, "skip" for Avoid

No markdown, no explanation, no code fences — raw JSON array only.`,
    },
    {
      role: "user",
      content: `Candidate profile:
Goal: ${profile.currentSearchGoal || "(not set)"}
Direction: ${profile.direction || "(not set)"}
Target roles: ${profile.targetRoles.join(", ") || "(not set)"}
Desired industries: ${profile.desiredIndustries.join(", ") || "(not set)"}
Skills to use more: ${profile.skillsToUseMore.join(", ") || "(none)"}
Skills to use less: ${profile.skillsToUseLess.join(", ") || "(none)"}
Constraints / deal-breakers: ${profile.constraints.join("; ") || "(none)"}

Skills (up to 25): ${skillLines || "(none recorded)"}

Generate role directions for this candidate.`,
    },
  ];

  const text = await withRetry(() => provider.generateText(messages, { maxTokens: 2048 }));

  // Strip markdown fences if present, then parse JSON.
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Try extracting the first JSON array or object from the text.
    const match = stripped.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!match) throw new Error("AI response contained no parseable JSON.");
    parsed = JSON.parse(match[0]);
  }

  // Accept a bare array or an object whose first array-valued property is the list.
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === "object") {
    const nested = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
    if (!nested) throw new Error("AI returned an unexpected JSON shape — no array found.");
    items = nested as unknown[];
  } else {
    throw new Error("AI returned an unexpected JSON shape.");
  }

  // Sanitize: ensure required fields and clamp score
  return (items as GeneratedRoleDirection[])
    .filter((d) => d.id && d.roleFamily && d.fitLevel && typeof d.score === "number")
    .map((d) => ({
      id: d.id,
      roleFamily: d.roleFamily,
      fitLevel: d.fitLevel,
      score: Math.min(100, Math.max(0, Math.round(d.score))),
      rationale: d.rationale ?? "",
      gaps: Array.isArray(d.gaps) ? d.gaps : [],
      recommendationType: d.recommendationType ?? "consider",
    }));
}
