import { getIntegrationCredential } from "../src/lib/db/queries";

/**
 * Validate a Clay enrichment routine before wiring it into Settings.
 *
 *   npm run clay:routine -- function:t_abc123 --linkedin=https://linkedin.com/in/someone
 *   npm run clay:routine -- function:t_abc123 --linkedin=https://linkedin.com/in/someone
 *
 * Sends exactly the inputs Job Search Terminal sends, then reports whether an
 * email came back and where in the response it was found — which is the part most
 * likely to differ, because a routine's output shape is defined by its author.
 *
 * This runs a real routine and spends enrichment credit for one person.
 */

const BASE = "https://api.clay.com/public/v0";
const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 3000;

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** Mirror of the app's extractor: walk for anything email-shaped, and report the path. */
function findEmailPath(payload: unknown, path = "$", depth = 0): { email: string; path: string } | null {
  if (depth > 8) return null;
  if (typeof payload === "string") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.trim()) ? { email: payload.trim(), path } : null;
  }
  if (Array.isArray(payload)) {
    for (const [i, item] of payload.entries()) {
      const found = findEmailPath(item, `${path}[${i}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (payload && typeof payload === "object") {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const found = findEmailPath(value, `${path}.${key}`, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function main() {
  const routineId = process.argv.slice(2).find((value) => !value.startsWith("--"));
  if (!routineId) {
    console.error("Usage: npm run clay:routine -- <routine_id> --linkedin=<profile-url>");
    process.exit(1);
  }

  const key = getIntegrationCredential("clay");
  if (!key) {
    console.error("No Clay API key saved. Add one in Settings → Integrations first.");
    process.exit(1);
  }

  // Clay's managed enrichment function declares its input as the literal label
  // "Social Profile URL". Verified against a live run — a snake_case key is
  // rejected with "Missing required field".
  //
  // No default profile: this spends real credits looking up a real person's
  // contact details, so the caller names who rather than inheriting whoever was
  // convenient when the script was written.
  const linkedin = arg("linkedin", "");
  if (!linkedin) {
    console.error("A LinkedIn profile URL is required: --linkedin=https://linkedin.com/in/…");
    console.error("Pick someone whose email Clay is likely to hold. This run spends enrichment credit.");
    process.exit(1);
  }
  const inputs = { "Social Profile URL": linkedin };

  console.log(`Routine : ${routineId}`);
  console.log(`Inputs  : ${JSON.stringify(inputs)}`);
  console.log("Running — this spends one person's enrichment credit.\n");

  const startRes = await fetch(`${BASE}/routines/${encodeURIComponent(routineId)}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "clay-api-key": key },
    body: JSON.stringify({ items: [{ id: "check-1", inputs }] }),
  });

  if (!startRes.ok) {
    const body = await startRes.text().catch(() => "");
    console.error(`Failed to start: HTTP ${startRes.status}`);
    console.error(body.slice(0, 400));
    if (startRes.status === 404) {
      console.error("\nA 404 usually means the routine id is wrong. Custom function ids look like `function:t_…`.");
    }
    process.exit(1);
  }

  const { routine_run_id: runId } = (await startRes.json()) as { routine_run_id?: string };
  if (!runId) {
    console.error("Clay accepted the request but returned no routine_run_id.");
    process.exit(1);
  }
  console.log(`Run id  : ${runId}`);

  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const res = await fetch(`${BASE}/routines/run/${encodeURIComponent(runId)}/results`, {
      headers: { Accept: "application/json", "clay-api-key": key },
    });
    if (!res.ok) {
      console.error(`Polling failed: HTTP ${res.status}`);
      process.exit(1);
    }
    const run = (await res.json()) as { status?: string };
    process.stdout.write(`  attempt ${attempt}: ${run.status ?? "unknown"}\n`);

    if (run.status === "complete" || run.status === "completed") {
      const found = findEmailPath(run);
      console.log("\n─── result ───────────────────────────────");
      if (found) {
        console.log(`✅ Email found at ${found.path}`);
        console.log(`   ${found.email}`);
        console.log("\nThis routine works with Job Search Terminal. Paste the id in Settings → Integrations.");
      } else {
        console.log("⚠️  The routine completed but no email-shaped value was found in its output.");
        console.log("   Job Search Terminal looks for any string matching an email pattern, at any depth,");
        console.log("   so the routine most likely returned nothing for this person rather than using an");
        console.log("   unexpected field name. Try --linkedin= with someone whose email Clay is likely to have.");
        console.log("\nFull response:");
        console.log(JSON.stringify(run, null, 2).slice(0, 2000));
      }
      return;
    }

    if (run.status === "failed" || run.status === "error") {
      console.error("\n❌ The routine failed inside Clay. Open the run in Clay to see which step errored.");
      console.error(JSON.stringify(run, null, 2).slice(0, 1200));
      process.exit(1);
    }
  }

  console.log(`\nStill running after ${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s.`);
  console.log("That is not a failure — check the run in Clay. The app polls for a shorter window,");
  console.log("so a routine this slow may need to be simplified before it is practical here.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
