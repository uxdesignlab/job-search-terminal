"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { catchUpStatusText, joinHosts } from "@/lib/catch-up-copy";
import type { CatchUpStatus } from "@/lib/scanner/board-catch-up";
import type { ActiveScan } from "@/lib/scanner/scan-activity";
import { cn } from "@/lib/utils";

/** Fired by the scan button when a scan ends, so status lines re-read at once instead of on their next poll. */
export const SCAN_FINISHED_EVENT = "jst:scan-finished";
/** Fired by the scan button when a scan starts, so the Dashboard panel picks it up at once. */
export const SCAN_STARTED_EVENT = "jst:scan-started";

const SCAN_POLL_MS = 3_000;

/** Poll fast while work is happening, slowly otherwise (to notice a new check after a scan). */
const ACTIVE_POLL_MS = 10_000;
const IDLE_POLL_MS = 30_000;

/**
 * Status of the background check for boards a job-board host refused during a
 * scan. `refreshKey` forces an immediate re-read (e.g. right after a scan ends).
 */
export function useCatchUpStatus(refreshKey: unknown = null): CatchUpStatus | null {
  const [status, setStatus] = useState<CatchUpStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      let next: CatchUpStatus | null = null;
      try {
        const res = await fetch("/api/job-discovery/catch-up", { cache: "no-store" });
        if (res.ok) next = (await res.json()) as CatchUpStatus;
      } catch {
        // Non-critical: the line simply stays as it was.
      }
      if (cancelled) return;
      if (next) setStatus(next);
      const active = next?.state === "running" || next?.state === "paused";
      timer = setTimeout(() => void load(), active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    const reloadNow = () => {
      if (timer) clearTimeout(timer);
      void load();
    };

    void load();
    window.addEventListener(SCAN_FINISHED_EVENT, reloadNow);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(SCAN_FINISHED_EVENT, reloadNow);
    };
  }, [refreshKey]);

  return status;
}

function Spinner() {
  return <span aria-hidden className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />;
}

type BackgroundActivity = { scans: ActiveScan[]; catchUp: CatchUpStatus };

/** Polls every 3 s while a scan runs (they take about two minutes), 10 s during a background check, 30 s otherwise. */
function useBackgroundActivity(): BackgroundActivity | null {
  const [activity, setActivity] = useState<BackgroundActivity | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      let next: BackgroundActivity | null = null;
      try {
        const res = await fetch("/api/job-discovery/activity", { cache: "no-store" });
        if (res.ok) next = (await res.json()) as BackgroundActivity;
      } catch {
        // Non-critical: the panel keeps its last state.
      }
      if (cancelled) return;
      if (next) setActivity(next);
      const delay =
        next && next.scans.length > 0
          ? SCAN_POLL_MS
          : next?.catchUp.state === "running" || next?.catchUp.state === "paused"
            ? ACTIVE_POLL_MS
            : IDLE_POLL_MS;
      timer = setTimeout(() => void load(), delay);
    };

    const reloadNow = () => {
      if (timer) clearTimeout(timer);
      void load();
    };

    void load();
    window.addEventListener(SCAN_FINISHED_EVENT, reloadNow);
    window.addEventListener(SCAN_STARTED_EVENT, reloadNow);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(SCAN_FINISHED_EVENT, reloadNow);
      window.removeEventListener(SCAN_STARTED_EVENT, reloadNow);
    };
  }, []);

  return activity;
}

const fmt = (n: number) => n.toLocaleString("en-US");

function LiveDot() {
  return (
    <span aria-hidden className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
    </span>
  );
}

function ProgressBar({ value, max, label, valueText }: { value: number; max: number; label: string; valueText: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className="h-1.5 overflow-hidden rounded-full bg-border"
      role="progressbar"
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <p>
      <span className="block text-sm font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-muted">{label}</span>
    </p>
  );
}

function elapsedLabel(startedAt: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const SOURCE_STATE: Record<ActiveScan["sources"][number]["status"], string> = {
  pending: "waiting",
  running: "checking",
  completed: "done",
  skipped: "skipped",
  failed: "stopped",
};

function ScanBlock({ scan }: { scan: ActiveScan }) {
  const title = scan.trigger === "scheduled" ? "Scheduled scan running" : "Your scan is running";
  const others = scan.sources.filter((s) => s.sourceId !== "career-sites" && s.status !== "skipped");
  return (
    <div className="space-y-2 rounded-control border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-ink">
          <LiveDot />
          {title}
        </p>
        <p className="text-xs tabular-nums text-muted">{elapsedLabel(scan.startedAt)}</p>
      </div>
      {scan.careerTotal > 0 ? (
        <ProgressBar
          label="Company job pages checked by this scan"
          max={scan.careerTotal}
          value={scan.careerChecked}
          valueText={`${fmt(scan.careerChecked)} of ${fmt(scan.careerTotal)} company job pages checked`}
        />
      ) : null}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label={`of ${fmt(scan.careerTotal)} company pages checked`} value={fmt(scan.careerChecked)} />
        {others.map((source) => (
          <Stat key={source.sourceId} label={source.sourceLabel} value={SOURCE_STATE[source.status]} />
        ))}
      </div>
    </div>
  );
}

function CatchUpBlock({ status }: { status: CatchUpStatus }) {
  const hosts = joinHosts(status.hosts);
  if (status.state === "finished") {
    return (
      <p className="rounded-control border border-border bg-surface px-3 py-2 text-xs text-muted">
        {catchUpStatusText(status)}
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-control border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-ink">
          <LiveDot />
          {status.state === "paused" ? "Background check paused" : "Background check running"}
        </p>
        <p className="text-xs tabular-nums text-muted">
          {status.state === "paused"
            ? `${hosts} asked us to wait`
            : status.etaMinutes
              ? `about ${status.etaMinutes} min left`
              : null}
        </p>
      </div>
      <ProgressBar
        label={`${hosts} boards checked in the background`}
        max={status.total}
        value={status.checked}
        valueText={`${fmt(status.checked)} of ${fmt(status.total)} boards checked`}
      />
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label={`of ${fmt(status.total)} ${hosts} boards checked`} value={fmt(status.checked)} />
        <Stat label="still to check" value={fmt(status.remaining)} />
        <Stat label={`new ${status.newJobsCount === 1 ? "job" : "jobs"} so far`} value={fmt(status.newJobsCount)} />
      </div>
    </div>
  );
}

/** Short sentence for screen readers; announced when it changes, not on every poll. */
function activitySummary(activity: BackgroundActivity): string {
  const parts: string[] = [];
  for (const scan of activity.scans) {
    parts.push(
      `${scan.trigger === "scheduled" ? "Scheduled scan" : "Your scan"} running, ${
        scan.careerTotal > 0 ? `${Math.round((scan.careerChecked / scan.careerTotal) * 10) * 10} percent of company pages checked` : "starting"
      }.`,
    );
  }
  // Coarse on purpose: counts and minutes change on every poll, and announcing each
  // change would talk over whatever the reader is doing.
  const c = activity.catchUp;
  if (c.state === "running" || c.state === "paused") {
    parts.push(`Background check ${c.state === "paused" ? "paused" : "running"} for ${joinHosts(c.hosts)} boards.`);
  } else if (c.state === "finished") {
    parts.push(`${catchUpStatusText(c)}.`);
  }
  return parts.join(" ");
}

/**
 * Live panel inside the Dashboard's "This week" card for every scan running in the
 * background: scheduled scans, a scan the user sent to the background, and the
 * background check for boards a job-board host refused. Shows nothing when idle.
 * When a scan ends or the check adds jobs, it refreshes the page so the card's
 * "from scans" count is current.
 */
export function BackgroundActivityPanel() {
  const router = useRouter();
  const activity = useBackgroundActivity();
  const last = useRef<{ scans: number; newJobs: number } | null>(null);

  useEffect(() => {
    if (!activity) return;
    const now = { scans: activity.scans.length, newJobs: activity.catchUp.newJobsCount };
    const prev = last.current;
    if (prev && ((prev.scans > 0 && now.scans < prev.scans) || now.newJobs > prev.newJobs)) router.refresh();
    last.current = now;
  }, [activity, router]);

  const showCatchUp = activity !== null && activity.catchUp.state !== "idle";
  const summary = activity ? activitySummary(activity) : "";

  return (
    <>
      <p aria-live="polite" className="sr-only" role="status">
        {summary}
      </p>
      {activity && (activity.scans.length > 0 || showCatchUp) ? (
        <div className="space-y-2">
          {activity.scans.map((scan) => (
            <ScanBlock key={scan.id} scan={scan} />
          ))}
          {showCatchUp ? <CatchUpBlock status={activity.catchUp} /> : null}
        </div>
      ) : null}
    </>
  );
}

/** One quiet line under "Scan for new jobs". Renders nothing when there is nothing to say. */
export function CatchUpStatusLine({ status, className }: { status: CatchUpStatus | null; className?: string }) {
  const text = status ? catchUpStatusText(status) : null;
  return (
    // The live region is always mounted so screen readers hear the line appear.
    <p aria-live="polite" className={cn("flex items-center gap-2 text-xs text-muted", !text && "sr-only", className)} role="status">
      {text && (status?.state === "running" || status?.state === "paused") ? <Spinner /> : null}
      {text ?? ""}
    </p>
  );
}

/**
 * Jobs page notice. New jobs from the background check never reshuffle the list
 * on their own — rows jumping while someone reads loses their place, and their
 * screen reader's. Instead the notice offers "Show N new jobs" and refreshes only
 * when asked.
 */
export function CatchUpJobsNotice({ initialNewJobsCount }: { initialNewJobsCount: number }) {
  const router = useRouter();
  const status = useCatchUpStatus();
  const shownCount = useRef(initialNewJobsCount);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!status) return;
    // A new check restarts its count from zero; follow it down so the next jobs are noticed.
    if (status.newJobsCount < shownCount.current) shownCount.current = status.newJobsCount;
    setPending(Math.max(0, status.newJobsCount - shownCount.current));
  }, [status]);

  const show = useCallback(() => {
    if (status) shownCount.current = status.newJobsCount;
    setPending(0);
    router.refresh();
  }, [router, status]);

  const text = status ? catchUpStatusText(status) : null;
  if (!text && pending === 0) return <p aria-live="polite" className="sr-only" role="status" />;

  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface px-4 py-2.5 text-sm"
      role="status"
    >
      <span className="flex items-center gap-2 text-muted">
        {status?.state === "running" || status?.state === "paused" ? <Spinner /> : null}
        {text}
      </span>
      {pending > 0 ? (
        <Button onClick={show} type="button" variant="secondary">
          Show {pending} new {pending === 1 ? "job" : "jobs"}
        </Button>
      ) : null}
    </div>
  );
}
