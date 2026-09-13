import { loadEnvConfig } from "@next/env";

// Runs under tsx, outside Next, so nothing loads .env.local otherwise.
loadEnvConfig(process.cwd());

import { getDatabase } from "../src/lib/db/client";
import { getApplicationPreparation, getEffectiveKeywordSignals, getGeneratedDocumentById, getJobById } from "../src/lib/db/queries";
import { keywordCoverageFor, isKeywordInText } from "../src/lib/documents/keyword-coverage";
import { buildTailoredDraft } from "../src/lib/documents/resume-generator";
import { checkResume } from "../src/lib/documents/resume-lint";
import type { ResumeTemplateInput } from "../src/lib/documents/resume-template";

/**
 * Measure resume generation on real jobs without saving a draft.
 *
 *   JST_DATABASE_PATH=/path/to/copy.sqlite npx tsx scripts/resume-quality-check.ts job-1 job-2
 *   JST_DATABASE_PATH=/path/to/copy.sqlite npx tsx scripts/resume-quality-check.ts --latest 3
 *
 * For each job it prints how long each stage took and on what, and compares the new
 * draft with the draft already stored for the job: keyword coverage, the checks
 * report, claims the guard reverted, and parts the writer could not produce.
 *
 * It makes real AI calls on the configured writer chain, and Application Preparation
 * saves its result as it always does. Only the resume draft is left unsaved. Point it at
 * a copy of a database, never the one you use.
 */

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function jobIds(): string[] {
  const latest = argValue("--latest");
  if (latest) {
    const rows = getDatabase()
      .prepare(`select job_id from generated_documents where document_type = 'resume' order by created_at desc limit ?`)
      .all(Number(latest)) as Array<{ job_id: string }>;
    return rows.map((row) => row.job_id);
  }
  return process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function flagged(draft: ResumeTemplateInput, jobId: string, title: string, evidence: string): string[] {
  const signals = getEffectiveKeywordSignals(jobId);
  const supported = signals.map((signal) => signal.keyword).filter((keyword) => isKeywordInText(evidence, keyword));
  return checkResume(draft, signals, supported, title).filter((check) => check.status === "flag").map((check) => check.label);
}

async function main() {
  const ids = jobIds();
  if (ids.length === 0) {
    console.error("Pass job ids, or --latest N.");
    process.exit(1);
  }

  for (const jobId of ids) {
    const job = getJobById(jobId);
    if (!job) {
      console.log(`\n${jobId}: not found`);
      continue;
    }
    const previous = getGeneratedDocumentById(`document-${jobId}`);
    const previousDraft = previous ? (JSON.parse(previous.draftJson) as ResumeTemplateInput) : null;

    console.log(`\n=== ${jobId} ===`);
    const built = await buildTailoredDraft(jobId, {
      onStage: (update) => {
        if (update.status === "started" && update.detail && update.stage === "writing") {
          console.log(`  … ${update.detail}${update.provider ? ` [${update.provider} ${update.model ?? ""}]` : ""}`);
        }
      },
    });

    const signals = getEffectiveKeywordSignals(jobId);
    const evidence = [
      JSON.stringify(built.draft),
      ...(getApplicationPreparation(jobId)?.evidenceMap ?? []).map((entry) => entry.evidence),
    ].join("\n");
    const audit = built.evidenceAudit;

    console.log(`  total           ${seconds(built.generationMs)} on ${built.providerUsed || "no AI"} ${built.modelUsed}`);
    for (const stage of built.stages) {
      console.log(`  ${stage.stage.padEnd(15)} ${seconds(stage.ms)}${stage.detail ? ` (${stage.detail})` : ""}`);
    }
    console.log(`  status          ${built.tailoringStatus}${built.fallbackReason ? ` — ${built.fallbackReason}` : ""}`);
    // The stored draft may carry the user's own edits and keyword additions, so the
    // approved source is the comparison that isolates what this generation did.
    console.log(`  coverage        ${built.sourceKeywordCoverage}% source → ${built.keywordCoverage}% new${previousDraft ? ` (stored draft, edits included: ${keywordCoverageFor(previousDraft, signals)}%)` : ""}`);
    console.log(`  reverted        ${(audit.reverted ?? []).length} lines${(audit.reverted ?? []).length ? ` (${[...new Set((audit.reverted ?? []).flatMap((revert) => revert.claims))].slice(0, 6).join(", ")})` : ""}`);
    console.log(`  restored        ${(audit.restored ?? []).length} lines`);
    console.log(`  unchanged       ${(audit.unchanged ?? []).map((entry) => `${entry.label} ${entry.unchanged}/${entry.total}`).join(", ") || "none notable"}`);
    console.log(`  part failures   ${(audit.unitFailures ?? []).map((failure) => `${failure.label}: ${failure.reason}`).join("; ") || "none"}`);
    if (previousDraft) console.log(`  checks (stored) ${flagged(previousDraft, jobId, job.title, evidence).join("; ") || "all clear"}`);
    console.log(`  checks (new)    ${(audit.checks ?? []).filter((check) => check.status === "flag").map((check) => check.label).join("; ") || "all clear"}`);
    for (const check of (audit.checks ?? []).filter((entry) => entry.status === "flag")) {
      console.log(`    ! ${check.label}: ${check.detail}`);
    }
    if (process.argv.includes("--show")) {
      console.log(`\n  SUMMARY\n  ${built.draft.summary}`);
      for (const entry of built.draft.experience) {
        console.log(`\n  ${entry.title}, ${entry.organization}`);
        for (const bullet of entry.bullets) console.log(`   - ${bullet}`);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
