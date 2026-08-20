import { createHash } from "node:crypto";
import { GAP_EVIDENCE_TAG } from "../gaps/evidence-id";
import type { ProfileSupplementRecord, ResumeRecord, SkillRecord } from "../db/types";

/**
 * Reuse keys for Application Preparation (PRD v0.2.1 §30).
 *
 * Two hashes decide whether a saved preparation is still valid. Getting the
 * second one's scope wrong is the failure mode worth naming: gap answers are
 * global, keyed on the gap text rather than the job that raised it, so answering
 * a gap on the /evidence page improves every job that shares it. An
 * evidence hash scoped to one job would leave all of those stale but marked fresh.
 */

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function normalizeForHash(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Covers the posting the preparation was derived from.
 *
 * Location is part of it because compensation research asks the market about
 * this title *in this place* (`"<title> salary range <location> 2026"`). Leaving
 * it out let a job move from Remote to on-site in New York and keep serving the
 * research done for the old one, indefinitely. The posted salary is part of it
 * for the same reason, one step earlier: it is parsed straight into the answer.
 */
export function computeJdHash(job: {
  title: string;
  location?: string;
  salaryNotes?: string;
  rawDescription: string;
  parsedDescription: string;
}): string {
  const description = job.rawDescription || job.parsedDescription || "";
  // salaryNotes is here because parsePostedCompensation reads it directly, and a
  // re-evaluation rewrites it: a newly extracted range with the title, location
  // and description unchanged would otherwise keep serving the old compensation
  // answer for good.
  return sha1(normalizeForHash(`${job.title}\n${job.location ?? ""}\n${job.salaryNotes ?? ""}\n${description}`));
}

/**
 * Covers the whole global evidence bank — not this job's slice of it — plus every
 * profile and role-strategy input the preparation prompt carries.
 *
 * Hash broadly, use claims narrowly (§26.2): every gap answer is hashed
 * regardless of quality, including unfinished ones, so that *finishing* an answer
 * invalidates the preparations it could now support. Generation still filters to
 * answers good enough to back a claim — that is a separate decision made later.
 */
export function computeEvidenceHash(input: {
  resumes: ResumeRecord[];
  skills: SkillRecord[];
  supplements: ProfileSupplementRecord[];
  /**
   * The system prompt the preparation is generated with, hashed whole.
   *
   * Naming the profile fields that matter is how this went wrong twice: the key
   * covered the evidence bank, then the evidence bank plus the compensation
   * target, while the prompt also carries goal, direction, career intent, work
   * preferences, target roles, industries, deal breakers, constraints and the
   * whole role strategy. Changing career direction went on serving evidence
   * mappings written for the old one. Hashing what is actually sent means the
   * next field added to the prompt is covered by the field being added.
   */
  promptContext?: string;
}): string {
  const resumeText = input.resumes
    .filter((resume) => resume.activeStatus)
    .map((resume) => `${resume.id}:${sha1(resume.extractedText ?? "")}`)
    .sort()
    .join("|");

  const skillText = input.skills
    .map((skill) => `${skill.skillName}:${skill.strengthLevel}:${skill.evidenceSource}`)
    .sort()
    .join("|");

  // Quality status is part of the key: an answer moving from needs_followup to
  // addressed changes nothing about its text but everything about whether a
  // resume may use it.
  const supplementText = input.supplements
    .map((supplement) => [
      supplement.id,
      supplement.qualityStatus,
      supplement.tags.includes(GAP_EVIDENCE_TAG) ? "gap" : "manual",
      sha1(normalizeForHash(supplement.content)),
    ].join(":"))
    .sort()
    .join("|");

  return sha1(`${resumeText}\n${skillText}\n${supplementText}\n${normalizeForHash(input.promptContext ?? "")}`);
}

export type StalenessReason = "missing" | "jd_changed" | "evidence_changed" | null;

/** Why a preparation cannot be reused — named, so the UI can say which input moved. */
export function stalenessReason(
  preparation: { jdHash: string; evidenceHash: string } | null | undefined,
  current: { jdHash: string; evidenceHash: string }
): StalenessReason {
  if (!preparation) return "missing";
  if (preparation.jdHash !== current.jdHash) return "jd_changed";
  if (preparation.evidenceHash !== current.evidenceHash) return "evidence_changed";
  return null;
}
