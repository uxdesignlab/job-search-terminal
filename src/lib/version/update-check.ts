/**
 * "Is there a newer version of Job Search Terminal?"
 *
 * The repo publishes no releases or tags, so the honest comparison is the one a
 * user would make by hand: how far is my checked-out commit behind the default
 * branch on GitHub. The compare API answers that in a single request and
 * returns the exact commit count, which is more useful than a version string
 * that only moves on release days.
 *
 * Privacy posture — this is the only outbound call the app makes that the user
 * did not explicitly trigger, so it is deliberately narrow:
 *   - it sends nothing but a commit SHA that is already public on GitHub,
 *   - it runs at most once every 24 hours, cached on disk across restarts,
 *   - it never blocks a render: a page always draws from the cached answer and
 *     refreshes in the background for the *next* load,
 *   - `JST_UPDATE_CHECK=off` disables it completely.
 *
 * If the project ever starts tagging releases, `/releases/latest` is the place
 * to extend this — the compare call stays as the fallback for untagged commits.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeFetch } from "@/lib/safe-fetch";
import { getLocalVersion } from "./local-version";

export type UpdateStatus =
  /** The user turned the check off. */
  | { state: "disabled" }
  /** Nothing checked yet, or the check could not produce an answer. */
  | { state: "unknown"; reason: string }
  /** The checkout matches the default branch. */
  | { state: "current"; checkedAt: string }
  /** The default branch has commits this checkout does not. */
  | { state: "behind"; behindBy: number; checkedAt: string; compareUrl: string };

type CacheFile = {
  /** SHA the cached answer describes — a `git pull` invalidates it immediately. */
  localSha: string;
  checkedAt: string;
  status: UpdateStatus;
};

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_BRANCH = "main";

const CACHE_PATH = () => path.join(process.cwd(), "data", "update-check.json");

/** Guards against a burst of concurrent renders each firing their own request. */
let inFlight: Promise<void> | null = null;

function isDisabled(): boolean {
  const raw = (process.env.JST_UPDATE_CHECK ?? "").trim().toLowerCase();
  return raw === "off" || raw === "false" || raw === "0" || raw === "no";
}

function readCache(): CacheFile | null {
  try {
    const cachePath = CACHE_PATH();
    if (!existsSync(cachePath)) return null;
    return JSON.parse(readFileSync(cachePath, "utf-8")) as CacheFile;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheFile): void {
  try {
    const cachePath = CACHE_PATH();
    mkdirSync(path.dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, `${JSON.stringify(entry, null, 2)}\n`, "utf-8");
  } catch {
    // A read-only data directory should not break the footer; the check simply
    // repeats on the next server start instead of persisting its answer.
  }
}

export type GitHubComparison = {
  status?: string;
  behind_by?: number;
  ahead_by?: number;
  html_url?: string;
};

/**
 * Turns a GitHub comparison into a user-facing status.
 *
 * `behind_by` is what matters, not `status`: a checkout carrying local commits
 * reports "diverged" rather than "behind", but the user is still missing
 * upstream work and still needs to pull.
 */
export function interpretComparison(
  comparison: GitHubComparison,
  checkedAt: string,
  fallbackCompareUrl: string
): UpdateStatus {
  const behindBy = typeof comparison.behind_by === "number" ? comparison.behind_by : 0;
  if (behindBy > 0) {
    return {
      state: "behind",
      behindBy,
      checkedAt,
      compareUrl: comparison.html_url ?? fallbackCompareUrl,
    };
  }
  return { state: "current", checkedAt };
}

async function refresh(): Promise<void> {
  const local = getLocalVersion();
  const checkedAt = new Date().toISOString();

  const store = (status: UpdateStatus) =>
    writeCache({ localSha: local.commitSha ?? "", checkedAt, status });

  if (!local.repo) {
    store({ state: "unknown", reason: "No GitHub repository configured in package.json." });
    return;
  }
  if (!local.commitSha) {
    store({
      state: "unknown",
      reason: "This copy has no git history, so it cannot be compared with GitHub.",
    });
    return;
  }

  const compareUrl = `https://github.com/${local.repo}/compare/${local.commitSha}...${DEFAULT_BRANCH}`;
  const apiUrl = `https://api.github.com/repos/${local.repo}/compare/${local.commitSha}...${DEFAULT_BRANCH}`;

  try {
    const response = await safeFetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "job-search-terminal",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 404) {
      // Usually an unpushed local commit, or a fork whose upstream moved on.
      store({
        state: "unknown",
        reason: "GitHub does not know this commit, so it cannot be compared.",
      });
      return;
    }
    if (response.status === 403 || response.status === 429) {
      store({ state: "unknown", reason: "GitHub rate-limited the update check. It will retry later." });
      return;
    }
    if (!response.ok) {
      store({ state: "unknown", reason: `GitHub replied ${response.status}.` });
      return;
    }

    store(interpretComparison((await response.json()) as GitHubComparison, checkedAt, compareUrl));
  } catch {
    store({ state: "unknown", reason: "Could not reach GitHub to check for updates." });
  }
}

/**
 * Returns the cached answer immediately and schedules a background refresh when
 * it has gone stale. Synchronous on purpose: the footer renders on every page,
 * and an update check is never worth delaying a page for.
 */
export function getUpdateStatus(): UpdateStatus {
  if (isDisabled()) return { state: "disabled" };

  const local = getLocalVersion();
  const cache = readCache();
  const describesThisCheckout = cache?.localSha === (local.commitSha ?? "");
  const age = cache ? Date.now() - Date.parse(cache.checkedAt) : Number.POSITIVE_INFINITY;
  const isFresh = describesThisCheckout && Number.isFinite(age) && age < CHECK_INTERVAL_MS;

  if (!isFresh && !inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }

  // A cache from a previous commit is worse than no answer: it would claim the
  // user is behind by a count they may have already pulled away.
  if (cache && describesThisCheckout) return cache.status;
  return { state: "unknown", reason: "Checking GitHub for updates…" };
}
