import { createHash } from "node:crypto";

/**
 * Tag every globally reusable gap answer carries. Distinguishes gap evidence
 * from free-form profile supplements written by hand in Settings.
 */
export const GAP_EVIDENCE_TAG = "gap-evidence";

/**
 * Stable ID for a gap answer in the global evidence bank — keyed on the gap
 * text, never on the job that raised it. The same gap surfacing on a second
 * requisition resolves to the same record, so answering it once is enough.
 *
 * SHA1 of the full gap text avoids the prefix-collision risk of truncated
 * base64, which two long gaps sharing an opening clause would hit.
 */
export function gapEvidenceId(gapText: string): string {
  return `gap-evidence-${createHash("sha1").update(gapText.trim()).digest("hex")}`;
}
