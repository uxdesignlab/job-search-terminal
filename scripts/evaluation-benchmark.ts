import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getJobs } from "../src/lib/db/queries";
import { evaluateJobWithAI } from "../src/lib/evaluation/llm-evaluator";
import { tryGetActiveProvider } from "../src/lib/ai/factory";
import { EVAL_JD_MIN_USABLE_CHARS } from "../src/lib/evaluation/fast-evaluation";

/**
 * Phase 0 baseline for PRD v0.2.1 §70.
 *
 * Captures how the current A–G evaluator performs before Fast Evaluation
 * replaces it, so "materially faster" becomes a number instead of a claim.
 * Run once, commit the output, and compare against it in Phase 1.
 *
 *   npm run evaluation:benchmark -- --limit=20
 *   npm run evaluation:benchmark -- --dry-run    # show selection, call nothing
 *
 * This makes real provider calls and costs real money. It is never part of
 * `npm test`.
 */

const OUTPUT_PATH = "docs/benchmarks/evaluation-v1-baseline.md";

/**
 * A–G issues one primary generation per block. Retries and Block D's optional
 * web search sit on top of this and are not separately observable from outside
 * the evaluator — `getActiveProvider()` is called internally, so the benchmark
 * cannot wrap it without a production hook. Recorded as a floor, not a total.
 */
const PRIMARY_GENERATIONS_PER_EVALUATION = 7;

type Sample = {
  jobId: string;
  title: string;
  company: string;
  jdChars: number;
  wallClockMs: number;
  reportedGenerationMs: number;
  outputChars: number;
  tokensReported: number;
  error?: string;
};

function arg(name: string, fallback: string): string {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank: with ~20 samples, interpolation implies a precision we do not have.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function median(values: number[]): number {
  return percentile(values, 50);
}

function descriptionOf(job: { rawDescription: string; parsedDescription: string }): string {
  return job.rawDescription || job.parsedDescription || "";
}

/**
 * Deterministic selection so a re-run compares like with like — a benchmark that
 * picked different jobs each run would measure the sample, not the evaluator.
 *
 * Sorted by id, then taken at an even stride rather than off the top: the
 * alphabetical head is dominated by one aggregator's 500-character stubs, which
 * would time a corpus of truncated postings instead of a representative mix.
 * The 300-char floor is §16's usable-JD threshold.
 */
function selectJobs(limit: number) {
  const eligible = getJobs()
    .filter((job) => descriptionOf(job).length >= EVAL_JD_MIN_USABLE_CHARS)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (eligible.length <= limit) return eligible;

  const stride = eligible.length / limit;
  return Array.from({ length: limit }, (_, index) => eligible[Math.floor(index * stride)]);
}

function renderReport(samples: Sample[], provider: string, model: string): string {
  const ok = samples.filter((sample) => !sample.error);
  const failed = samples.filter((sample) => sample.error);
  const wall = ok.map((sample) => sample.wallClockMs);
  const output = ok.map((sample) => sample.outputChars);

  const rows = samples
    .map((sample) => {
      const cells = sample.error
        ? ["—", "—", "—", `error: ${sample.error}`]
        : [
            String(sample.wallClockMs),
            String(sample.reportedGenerationMs),
            String(sample.outputChars),
            String(sample.jdChars),
          ];
      return `| ${sample.jobId} | ${sample.company} — ${sample.title} | ${cells.join(" | ")} |`;
    })
    .join("\n");

  return `# Evaluation baseline — A–G pipeline (evaluation-v1)

Captured by \`npm run evaluation:benchmark\` before PRD v0.2.1 Phase 1 replaced the
seven-block evaluator with one structured Fast Evaluation call.

- **Captured:** ${new Date().toISOString()}
- **Provider / model:** ${provider} / ${model}
- **Jobs attempted:** ${samples.length} (${ok.length} succeeded, ${failed.length} failed)

## Headline numbers

| Metric | Baseline |
|---|---:|
| Wall-clock p50 | ${median(wall)} ms |
| Wall-clock p90 | ${percentile(wall, 90)} ms |
| Generated output, median | ${median(output)} chars |
| Primary generations per evaluation | ${PRIMARY_GENERATIONS_PER_EVALUATION} (floor) |

## Phase 1 targets (§70.2)

Fast Evaluation must hit all of these against the numbers above:

| Metric | Target | Threshold |
|---|---|---:|
| Primary generations | exactly 1 | 1 |
| Wall-clock p50 | ≤ 50% of baseline | ${Math.round(median(wall) * 0.5)} ms |
| Wall-clock p90 | ≤ 65% of baseline | ${Math.round(percentile(wall, 90) * 0.65)} ms |
| Median output size | ≤ 40% of baseline | ${Math.round(median(output) * 0.4)} chars |

## What this does and does not measure

Measured: wall-clock per evaluation, the evaluator's own reported \`generationMs\`,
the character size of the generated result, and JD size as the main input variable.

Not measured: provider token counts and retry counts. \`tokensUsed\` is written as
\`0\` by the current evaluator, and \`getActiveProvider()\` is called inside
\`evaluateJobWithAI\`, so the benchmark cannot wrap the provider to count requests
without adding an instrumentation hook to production code. The generation count
above is therefore the structural floor (one call per block), excluding retries and
Block D's optional web search. Character size is the stable proxy for comparison.

## Per-job samples

| Job | Role | Wall ms | Reported ms | Output chars | JD chars |
|---|---|---:|---:|---:|---:|
${rows}
`;
}

async function main() {
  const limit = Number.parseInt(arg("limit", "20"), 10);
  const dryRun = process.argv.includes("--dry-run");

  const jobs = selectJobs(limit);
  if (jobs.length === 0) {
    console.error(`No jobs with a usable description (>= ${EVAL_JD_MIN_USABLE_CHARS} chars) found. Scan or import jobs first.`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`Would benchmark ${jobs.length} job(s):`);
    for (const job of jobs) {
      console.log(`  ${job.id} — ${job.company} — ${job.title} (${descriptionOf(job).length} JD chars)`);
    }
    return;
  }

  const provider = tryGetActiveProvider();
  if (!provider) {
    console.error("No AI provider configured. Set one in Settings → AI Provider before benchmarking.");
    process.exit(1);
  }

  console.log(`Benchmarking ${jobs.length} job(s) against ${provider.name} / ${provider.effectiveModel}.`);
  console.log("This makes real provider calls and will take several minutes.\n");

  const samples: Sample[] = [];

  for (const [index, job] of jobs.entries()) {
    const label = `[${index + 1}/${jobs.length}] ${job.company} — ${job.title}`;
    process.stdout.write(`${label} … `);

    const startedAt = Date.now();
    try {
      const result = await evaluateJobWithAI(job.id);
      const wallClockMs = Date.now() - startedAt;
      samples.push({
        jobId: job.id,
        title: job.title,
        company: job.company,
        jdChars: descriptionOf(job).length,
        wallClockMs,
        reportedGenerationMs: result.generationMs,
        outputChars: JSON.stringify(result).length,
        tokensReported: result.tokensUsed,
      });
      console.log(`${wallClockMs} ms`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      samples.push({
        jobId: job.id,
        title: job.title,
        company: job.company,
        jdChars: descriptionOf(job).length,
        wallClockMs: 0,
        reportedGenerationMs: 0,
        outputChars: 0,
        tokensReported: 0,
        error: message,
      });
      console.log(`failed — ${message}`);
    }
  }

  const report = renderReport(samples, provider.name, provider.effectiveModel);
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, report, "utf8");

  const ok = samples.filter((sample) => !sample.error).map((sample) => sample.wallClockMs);
  console.log(`\nBaseline written to ${OUTPUT_PATH}`);
  console.log(`p50 ${median(ok)} ms · p90 ${percentile(ok, 90)} ms across ${ok.length} successful evaluation(s).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
