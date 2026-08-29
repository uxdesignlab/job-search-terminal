import { Badge } from "@/components/ui";
import { formatDaysAgo } from "@/lib/dates";
import { getLocalVersion } from "@/lib/version/local-version";
import { getUpdateStatus } from "@/lib/version/update-check";

/**
 * Footer build stamp for a self-hosted install: which version is running, and
 * whether the upstream repository has moved on since this copy was pulled.
 *
 * Server component — the version is read from package.json and git on the
 * machine running the app, and the update status comes from a cached answer
 * that never blocks this render.
 */
export function AppVersion() {
  const local = getLocalVersion();
  const status = getUpdateStatus();

  const commitTitle = [
    local.branch ? `branch ${local.branch}` : null,
    local.commitDate ? `committed ${formatDaysAgo(local.commitDate)}` : null,
    local.dirty ? "with uncommitted local changes" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // The changelog is what makes a version number mean something, so the number
  // itself is the link to it rather than a separate "what's new" item.
  const changelogUrl = local.repo
    ? `https://github.com/${local.repo}/blob/main/CHANGELOG.md`
    : null;

  const versionNumber = changelogUrl ? (
    <a
      className="font-medium text-ink underline decoration-border underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
      href={changelogUrl}
      rel="noreferrer"
      target="_blank"
      title="What changed in each version"
    >
      {local.packageVersion}
    </a>
  ) : (
    <span className="font-medium text-ink">{local.packageVersion}</span>
  );

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span title={commitTitle || undefined}>
        Version {versionNumber}
        {local.shortSha ? (
          <>
            {" · "}
            <span className="font-mono">{local.shortSha}</span>
            {local.dirty ? "*" : null}
          </>
        ) : null}
      </span>

      {status.state === "behind" ? (
        <a
          className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          href={status.compareUrl}
          rel="noreferrer"
          target="_blank"
          title={`Run "git pull" in your Job Search Terminal folder to update. Checked ${formatDaysAgo(status.checkedAt)}.`}
        >
          <Badge className="min-h-0 py-0.5 hover:bg-warning/20 transition-colors" tone="warning">
            Update available — {status.behindBy} {status.behindBy === 1 ? "commit" : "commits"} behind ↗
          </Badge>
        </a>
      ) : null}

      {status.state === "current" ? (
        <span title={`Checked ${formatDaysAgo(status.checkedAt)}.`}>· Up to date</span>
      ) : null}

      {status.state === "unknown" ? <span title={status.reason}>· Update status unknown</span> : null}
    </p>
  );
}
