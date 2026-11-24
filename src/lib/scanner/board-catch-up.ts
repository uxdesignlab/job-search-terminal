/**
 * Background check for boards a job-board host refused during a scan.
 *
 * When Greenhouse (or Ashby, or Lever) answers HTTP 429 "too many requests", the
 * scan stops sending to that host and hands the boards it did not reach to this
 * module. The scan then finishes for the user at normal speed. This module works
 * through the saved list slowly, while the app is running, and adds anything it
 * finds to the Jobs list through the same filters and dedup rules the scan uses.
 *
 * Pacing is adaptive because the hosts do not publish their limits: one board per
 * tick to start, up to `MAX_BATCH` while every request succeeds, and a pause that
 * doubles (to `MAX_BACKOFF_MS`) whenever the host refuses again. The queue and the
 * session state live in the database (`board_catch_up_queue`,
 * `board_catch_up_state`), so a restart resumes the work instead of losing it.
 */
import { getDatabase } from "@/lib/db/client";
import { getJobDedupKeys, getScanSchedule, getTitleFilters, getUserProfile, insertScannedJobs } from "@/lib/db/queries";
import {
  ATS_HOST_LABEL,
  collectBoardJobs,
  createBoardJobContext,
  fetchJson,
  isCareerScanInProgress,
  isRateLimitError,
  loadScanConfig,
  type AtsType,
  type BoardJobContext,
  type DeferredBoard,
} from "./careerops-scanner";

/** How often the scheduler calls `runCatchUpTick`. */
export const CATCH_UP_TICK_MS = 2_000;
/** Most boards one tick checks once the host has been answering cleanly. */
export const MAX_BATCH = 3;
/** First pause after a refusal; doubles on each further refusal. */
export const INITIAL_BACKOFF_MS = 60_000;
export const MAX_BACKOFF_MS = 15 * 60_000;
/** A finished check stays visible (status line, "Found after scan" markers) this long. */
export const FINISHED_VISIBLE_MS = 24 * 60 * 60_000;
/** How long a cached dedup/filter context is reused between ticks. */
const CONTEXT_TTL_MS = 60_000;

const STATE_ID = "singleton";

/** Job statuses that mean the user acted on a company's role — its board is checked first. */
const ENGAGED_STATUSES = [
  "Applied",
  "Reviewed",
  "Resume generated",
  "Interviewing",
  "Follow-up needed",
  "Recruiter responded",
];

type StateRow = {
  id: string;
  hosts_json: string;
  origin_scan_id: string;
  started_at: string;
  finished_at: string | null;
  total_count: number;
  checked_count: number;
  new_jobs_count: number;
  found_job_ids_json: string;
  paused_until: string | null;
  backoff_ms: number;
  batch_size: number;
  updated_at: string;
};

type QueueRow = {
  name: string;
  api_type: AtsType;
  api_url: string;
  priority: number;
  queued_at: string;
};

export type CatchUpStatus = {
  /**
   * idle: nothing to report. running: checking now. paused: the host refused again
   * and the check is waiting. finished: done within the last day.
   */
  state: "idle" | "running" | "paused" | "finished";
  /** Host names in display form, e.g. ["Greenhouse"]. */
  hosts: string[];
  total: number;
  checked: number;
  remaining: number;
  newJobsCount: number;
  /** Ids of jobs this check added; the Jobs list marks them "Found after scan". */
  foundJobIds: string[];
  startedAt: string | null;
  finishedAt: string | null;
  pausedUntil: string | null;
  /** Rough minutes left at the current pace, or null when there is nothing left. */
  etaMinutes: number | null;
};

function readState(): StateRow | undefined {
  return getDatabase().prepare("select * from board_catch_up_state where id = ?").get(STATE_ID) as StateRow | undefined;
}

function remainingCount(): number {
  const row = getDatabase().prepare("select count(*) as n from board_catch_up_queue").get() as { n: number };
  return row.n;
}

function parseList(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Board priority by company name (lower-cased): 2 when the user has acted on one of
 * its roles, 1 when it produced a job in the last 60 days, otherwise absent (0).
 * Both the scan and the background check go highest first.
 */
export function getBoardPriorities(): Map<string, number> {
  const placeholders = ENGAGED_STATUSES.map(() => "?").join(", ");
  const rows = getDatabase()
    .prepare(
      `select lower(company) as company,
              max(case when status in (${placeholders}) then 2 else 1 end) as priority
         from jobs
        where status in (${placeholders}) or first_seen_date >= date('now', '-60 day')
        group by lower(company)`,
    )
    .all(...ENGAGED_STATUSES, ...ENGAGED_STATUSES) as Array<{ company: string; priority: number }>;
  return new Map(rows.map((r) => [r.company, r.priority]));
}

/** Names the background check currently holds; a scan leaves these alone. */
export function getQueuedBoardNames(): Set<string> {
  const rows = getDatabase().prepare("select name from board_catch_up_queue").all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

/**
 * Saves boards a scan could not reach. Joins the current check when one is still
 * running, so two scans in a row produce one status line, not two; otherwise
 * starts a new check and clears the previous one's "Found after scan" markers.
 */
export function enqueueDeferredBoards(boards: DeferredBoard[], originScanId: string, now = new Date()) {
  if (boards.length === 0) return;
  const db = getDatabase();
  const nowIso = now.toISOString();
  const hosts = [...new Set(boards.map((b) => b.apiType))];

  db.transaction(() => {
    const state = readState();
    const active = state && !state.finished_at;
    const insert = db.prepare(
      `insert or ignore into board_catch_up_queue (name, api_type, api_url, priority, queued_at)
       values (?, ?, ?, ?, ?)`,
    );
    let added = 0;
    for (const b of boards) added += insert.run(b.name, b.apiType, b.apiUrl, b.priority, nowIso).changes;

    if (active) {
      const merged = [...new Set([...parseList(state.hosts_json), ...hosts])];
      // The host just refused again: make sure the check waits before its next request.
      const pauseFloor = new Date(now.getTime() + INITIAL_BACKOFF_MS).toISOString();
      const pausedUntil =
        state.paused_until && state.paused_until > pauseFloor ? state.paused_until : pauseFloor;
      db.prepare(
        `update board_catch_up_state
            set hosts_json = ?, total_count = total_count + ?, paused_until = ?, updated_at = ?
          where id = ?`,
      ).run(JSON.stringify(merged), added, pausedUntil, nowIso, STATE_ID);
    } else {
      db.prepare(
        `insert into board_catch_up_state
           (id, hosts_json, origin_scan_id, started_at, finished_at, total_count, checked_count,
            new_jobs_count, found_job_ids_json, paused_until, backoff_ms, batch_size, updated_at)
         values (?, ?, ?, ?, null, ?, 0, 0, '[]', ?, ?, 1, ?)
         on conflict(id) do update set
           hosts_json = excluded.hosts_json,
           origin_scan_id = excluded.origin_scan_id,
           started_at = excluded.started_at,
           finished_at = null,
           total_count = excluded.total_count,
           checked_count = 0,
           new_jobs_count = 0,
           found_job_ids_json = '[]',
           paused_until = excluded.paused_until,
           backoff_ms = excluded.backoff_ms,
           batch_size = 1,
           updated_at = excluded.updated_at`,
      ).run(
        STATE_ID,
        JSON.stringify(hosts),
        originScanId,
        nowIso,
        added,
        // The host just refused us: give it a minute before the first retry.
        new Date(now.getTime() + INITIAL_BACKOFF_MS).toISOString(),
        INITIAL_BACKOFF_MS,
        nowIso,
      );
    }
  })();
}

export function getCatchUpStatus(now = new Date()): CatchUpStatus {
  const state = readState();
  const idle: CatchUpStatus = {
    state: "idle",
    hosts: [],
    total: 0,
    checked: 0,
    remaining: 0,
    newJobsCount: 0,
    foundJobIds: [],
    startedAt: null,
    finishedAt: null,
    pausedUntil: null,
    etaMinutes: null,
  };
  if (!state) return idle;

  if (state.finished_at && now.getTime() - new Date(state.finished_at).getTime() > FINISHED_VISIBLE_MS) {
    return idle;
  }

  const remaining = state.finished_at ? 0 : remainingCount();
  const paused = !state.finished_at && state.paused_until !== null && new Date(state.paused_until) > now;
  const pauseLeftMs = paused && state.paused_until ? new Date(state.paused_until).getTime() - now.getTime() : 0;
  const perBoardMs = CATCH_UP_TICK_MS / Math.max(1, state.batch_size);
  const etaMinutes = remaining > 0 ? Math.max(1, Math.ceil((remaining * perBoardMs + pauseLeftMs) / 60_000)) : null;

  return {
    state: state.finished_at ? "finished" : paused ? "paused" : "running",
    hosts: parseList(state.hosts_json).map((h) => ATS_HOST_LABEL[h as AtsType] ?? h),
    total: state.total_count,
    checked: state.checked_count,
    remaining,
    newJobsCount: state.new_jobs_count,
    foundJobIds: parseList(state.found_job_ids_json),
    startedAt: state.started_at,
    finishedAt: state.finished_at,
    pausedUntil: paused ? state.paused_until : null,
    etaMinutes,
  };
}

let cachedContext: { ctx: BoardJobContext; builtAt: number } | null = null;

function buildContext(now: Date): BoardJobContext {
  const dbFilters = getTitleFilters();
  const titleFilter =
    dbFilters.positive.length > 0 || dbFilters.negative.length > 0 ? dbFilters : loadScanConfig().title_filter;
  return createBoardJobContext({
    titleFilter,
    profile: getUserProfile(),
    freshnessWindowHours: getScanSchedule().freshnessWindowHours,
    now,
    dedup: getJobDedupKeys(),
  });
}

function contextFor(now: Date): BoardJobContext {
  if (!cachedContext || now.getTime() - cachedContext.builtAt > CONTEXT_TTL_MS) {
    cachedContext = { ctx: buildContext(now), builtAt: now.getTime() };
  }
  const { ctx } = cachedContext;
  ctx.newJobs = [];
  return ctx;
}

let tickInFlight = false;

export type CatchUpTickResult = "idle" | "waiting" | "checked" | "rate_limited" | "finished";

/**
 * One step of the background check. Called every `CATCH_UP_TICK_MS` by the
 * scheduler; does nothing while a scan is running, while paused, or with an empty queue.
 */
export async function runCatchUpTick(
  deps: { fetcher?: (url: string) => Promise<unknown>; now?: () => Date; context?: (now: Date) => BoardJobContext } = {},
): Promise<CatchUpTickResult> {
  if (tickInFlight) return "waiting";
  tickInFlight = true;
  try {
    return await tick(deps);
  } finally {
    tickInFlight = false;
  }
}

async function tick(deps: {
  fetcher?: (url: string) => Promise<unknown>;
  now?: () => Date;
  context?: (now: Date) => BoardJobContext;
}): Promise<CatchUpTickResult> {
  const clock = deps.now ?? (() => new Date());
  const state = readState();
  if (!state || state.finished_at) return "idle";
  if (isCareerScanInProgress()) return "waiting";

  const now = clock();
  if (state.paused_until && new Date(state.paused_until) > now) return "waiting";

  const db = getDatabase();
  const batch = db
    .prepare("select * from board_catch_up_queue order by priority desc, queued_at asc, name asc limit ?")
    .all(Math.max(1, Math.min(MAX_BATCH, state.batch_size))) as QueueRow[];

  if (batch.length === 0) {
    db.prepare("update board_catch_up_state set finished_at = ?, paused_until = null, updated_at = ? where id = ?").run(
      now.toISOString(),
      now.toISOString(),
      STATE_ID,
    );
    return "finished";
  }

  const fetcher = deps.fetcher ?? fetchJson;
  const ctx = (deps.context ?? contextFor)(now);
  let checked = 0;
  let refused = false;
  const done: string[] = [];

  // One at a time within a tick: the point is to be gentle, not fast.
  for (const board of batch) {
    try {
      const json = await fetcher(board.api_url);
      collectBoardJobs(ctx, board.name, board.api_type, json);
      done.push(board.name);
      checked++;
    } catch (error) {
      if (isRateLimitError(error)) {
        refused = true;
        break;
      }
      // Dead or failing boards are not this check's to report; the next scan
      // lists them with the usual "Dead or missing" treatment. Drop and move on.
      done.push(board.name);
      checked++;
    }
  }

  const inserted = ctx.newJobs.length > 0 ? insertScannedJobs(ctx.newJobs) : 0;
  const foundIds = inserted > 0 ? ctx.newJobs.map((j) => j.id) : [];
  const finishedAt = clock().toISOString();

  db.transaction(() => {
    const remove = db.prepare("delete from board_catch_up_queue where name = ?");
    for (const name of done) remove.run(name);

    const found = foundIds.length > 0 ? [...parseList(state.found_job_ids_json), ...foundIds] : null;
    if (refused) {
      const backoff = state.backoff_ms;
      db.prepare(
        `update board_catch_up_state
            set checked_count = checked_count + ?, new_jobs_count = new_jobs_count + ?,
                found_job_ids_json = coalesce(?, found_job_ids_json),
                paused_until = ?, backoff_ms = ?, batch_size = 1, updated_at = ?
          where id = ?`,
      ).run(
        checked,
        inserted,
        found ? JSON.stringify(found) : null,
        new Date(now.getTime() + backoff).toISOString(),
        Math.min(backoff * 2, MAX_BACKOFF_MS),
        finishedAt,
        STATE_ID,
      );
    } else {
      db.prepare(
        `update board_catch_up_state
            set checked_count = checked_count + ?, new_jobs_count = new_jobs_count + ?,
                found_job_ids_json = coalesce(?, found_job_ids_json),
                paused_until = null, backoff_ms = ?, batch_size = ?, updated_at = ?
          where id = ?`,
      ).run(
        checked,
        inserted,
        found ? JSON.stringify(found) : null,
        INITIAL_BACKOFF_MS,
        Math.min(state.batch_size + 1, MAX_BATCH),
        finishedAt,
        STATE_ID,
      );
    }
  })();

  return refused ? "rate_limited" : "checked";
}

/** Test hook: forget the cached filter/dedup context. */
export function resetCatchUpContextCache() {
  cachedContext = null;
}
