/**
 * Clear gap follow-up questions written before the "only ask what a resume
 * needs" rules landed.
 *
 * Those questions asked for employers, titles, and dates already on the resume,
 * ran to four or five per gap, and were regenerated differently on every visit.
 * This wipes the stored question text on `needs_followup` rows in both
 * `job_gap_responses` and `profile_gap_supplements` so each one is re-asked
 * properly the next time its answer is saved.
 *
 * Non-destructive to answers: only `follow_up_question` and the
 * `followUpQuestions` key inside `assessment_json` are touched. Answer text,
 * quality status, rationale, and signals are left exactly as they are, and no
 * row is deleted. Until a row is re-assessed the UI falls back to a
 * deterministic scale question, so nothing renders blank.
 *
 * Usage:
 *   npx tsx scripts/clear-stale-gap-questions.ts --dry-run
 *   npx tsx scripts/clear-stale-gap-questions.ts
 */

import { getDatabase } from "../src/lib/db/client";

type Row = { id: string; follow_up_question: string; assessment_json: string };

const TABLES = ["job_gap_responses", "profile_gap_supplements"] as const;

const dryRun = process.argv.includes("--dry-run");

/** Strip only the question list, preserving rationale/signals/assessedBy. */
function stripQuestions(assessmentJson: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(assessmentJson || "{}") as Record<string, unknown>;
  } catch {
    // Unparseable assessment blobs are replaced with an empty object rather
    // than left to break the next read.
    return "{}";
  }
  if (parsed === null || typeof parsed !== "object") return "{}";
  delete parsed.followUpQuestions;
  return JSON.stringify(parsed);
}

function main() {
  const db = getDatabase();
  let totalCleared = 0;

  for (const table of TABLES) {
    const rows = db
      .prepare(
        `select id, follow_up_question, assessment_json
         from ${table}
         where quality_status = 'needs_followup'`
      )
      .all() as Row[];

    const stale = rows.filter((row) => {
      if (row.follow_up_question.trim()) return true;
      return row.assessment_json.includes("followUpQuestions");
    });

    console.log(`${table}: ${rows.length} needs_followup row(s), ${stale.length} carrying stored questions`);

    if (!dryRun && stale.length > 0) {
      const update = db.prepare(
        `update ${table}
         set follow_up_question = '', assessment_json = @assessmentJson
         where id = @id`
      );
      const clearAll = db.transaction((items: Row[]) => {
        for (const row of items) {
          update.run({ id: row.id, assessmentJson: stripQuestions(row.assessment_json) });
        }
      });
      clearAll(stale);
    }

    totalCleared += stale.length;
  }

  if (dryRun) {
    console.log(`\nDry run — nothing written. ${totalCleared} row(s) would be cleared.`);
    return;
  }
  console.log(`\nCleared stored questions on ${totalCleared} row(s).`);
  console.log("Each gap is re-asked under the current rules the next time its answer is saved.");
}

main();
