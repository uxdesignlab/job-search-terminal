/**
 * Identity of the checkout that is currently running.
 *
 * Job Search Terminal is self-hosted from a git clone, so "which version am I
 * on" has two halves: the declared `package.json` version, which moves rarely,
 * and the commit the working copy actually sits on, which is what a user's
 * `git pull` changes. The footer shows both, and the update check compares the
 * commit — the version string alone cannot tell anyone whether they are behind.
 *
 * Everything here degrades to `null` rather than throwing. A copy downloaded as
 * a zip has no `.git` directory, and `git` may not be on PATH at all; neither
 * is an error, it just means the update check has nothing to compare against.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export type LocalVersion = {
  /** Declared version from package.json, e.g. "0.1.0". */
  packageVersion: string;
  /** Full commit SHA of HEAD, or null when git metadata is unavailable. */
  commitSha: string | null;
  /** First 7 characters of the SHA, for display. */
  shortSha: string | null;
  /** Current branch name, or null when detached or unavailable. */
  branch: string | null;
  /** ISO 8601 commit date of HEAD, or null. */
  commitDate: string | null;
  /** True when the working copy has uncommitted changes. */
  dirty: boolean;
  /** `owner/repo` parsed from package.json, so a fork checks its own origin. */
  repo: string | null;
  /**
   * The newest commit this checkout shares with the fetched remote branch — the
   * merge base of HEAD and `origin/main`.
   *
   * This, not HEAD, is what the update check may send to GitHub. With no local
   * commits the two are the same. With local commits HEAD is a private
   * identifier that exists nowhere but this machine, and sending it would break
   * the promise the footer makes; the merge base is provably on the remote, and
   * counting from it still answers the real question — what `git pull` would
   * bring down.
   *
   * Null when no remote-tracking branch is present (a shallow or remoteless
   * clone), in which case the check reports "unknown" rather than guessing.
   */
  publicBaseSha: string | null;
};

/** Resolved once per process — none of this changes while the server is up. */
let cached: LocalVersion | null = null;

function runGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Not a git checkout, git missing from PATH, or the call timed out.
    return null;
  }
}

/**
 * Pulls `owner/repo` out of the package.json repository URL rather than
 * hard-coding it, so a fork's copy checks the fork for updates instead of
 * pointing every downstream user back at the original repo.
 */
function parseRepo(repositoryUrl: unknown): string | null {
  if (typeof repositoryUrl !== "string") return null;
  const match = repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Newest commit shared with a remote-tracking branch. `origin/main` first, then
 * whatever `origin/HEAD` points at, so a fork with a differently named default
 * branch still works. Returns null rather than falling back to HEAD — a private
 * SHA is exactly what this exists to avoid sending.
 */
function resolvePublicBase(): string | null {
  for (const ref of ["origin/main", "origin/HEAD"]) {
    const base = runGit(["merge-base", "HEAD", ref]);
    if (base) return base;
  }
  return null;
}

export function getLocalVersion(): LocalVersion {
  if (cached) return cached;

  let packageVersion = "unknown";
  let repo: string | null = null;
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    ) as { version?: string; repository?: { url?: string } | string };
    packageVersion = pkg.version ?? "unknown";
    repo = parseRepo(typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url);
  } catch {
    // Leave the defaults — the footer renders "unknown" rather than breaking.
  }

  const commitSha = runGit(["rev-parse", "HEAD"]);
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);

  cached = {
    packageVersion,
    commitSha,
    shortSha: commitSha ? commitSha.slice(0, 7) : null,
    branch: branch === "HEAD" ? null : branch,
    commitDate: runGit(["log", "-1", "--format=%cI"]),
    dirty: (runGit(["status", "--porcelain"]) ?? "") !== "",
    repo,
    publicBaseSha: resolvePublicBase(),
  };

  return cached;
}

/** Test seam — forces the next `getLocalVersion()` call to re-read from disk. */
export function resetLocalVersionCache(): void {
  cached = null;
}
