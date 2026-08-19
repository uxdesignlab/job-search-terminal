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

/** Covers the posting text the preparation was derived from. */
export function computeJdHash(job: { title: string; rawDescription: string; parsedDescription: string }): string {
  const description = job.rawDescription || job.parsedDescription || "";
  return sha1(normalizeForHash(`${job.title}\n${description}`));
}

/**
 * Covers the whole global evidence bank, not this job's slice of it.
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

  return sha1(`${resumeText}\n${skillText}\n${supplementText}`);
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
