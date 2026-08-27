import type { ResumeRecord } from "@/lib/db/types";

/**
 * Whether a lane holds a usable resume.
 *
 * The wizard read `sourceFile` while the lane card read `wordCount > 0`, so a PDF that
 * saved but yielded no text showed "Not uploaded" on a card inside a step the wizard
 * considered satisfied. Both facts matter — a file on disk the app cannot read is not
 * a resume it can tailor — so the predicate requires both, in one place.
 */
export function laneHasResume(resume: Pick<ResumeRecord, "sourceFile" | "wordCount">): boolean {
  return Boolean(resume.sourceFile) && resume.wordCount > 0;
}
