import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobPreferenceProfile } from "@/lib/jobs/preference-fit";

let tempDir: string | null = null;

const profile: JobPreferenceProfile = {
  location: "Chicago, IL",
  preferredLocations: ["United States"],
  remoteLocations: [],
  remotePreference: "local-or-remote",
  workPreferences: ["Remote first"],
  workModes: ["remote", "hybrid", "onsite"],
  constraints: [],
  dealBreakers: [],
};

async function load() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-catch-up-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  client.getDatabase();
  const catchUp = await import("@/lib/scanner/board-catch-up");
  const scanner = await import("@/lib/scanner/careerops-scanner");
  const context = () =>
    scanner.createBoardJobContext({
      titleFilter: { positive: ["Product Design"], negative: [] },
      profile,
      freshnessWindowHours: 168,
      now: new Date("2026-08-17T12:00:00Z"),
      dedup: scanner.emptyDedupKeys(),
    });
  return { client, catchUp, scanner, context };
}

const board = (name: string, priority = 0) => ({
  name,
  apiType: "greenhouse" as const,
  apiUrl: `https://boards-api.greenhouse.io/v1/boards/${name}/jobs`,
  priority,
});

const payload = (name: string) => ({
  jobs: [
    {
      title: "Director, Product Design",
      absolute_url: `https://job-boards.greenhouse.io/${name}/jobs/1`,
      location: { name: "Remote" },
      updated_at: "2026-08-16T00:00:00Z",
    },
  ],
});

const nameOf = (url: string) => url.match(/boards\/([^/]+)\/jobs/)?.[1] ?? url;

beforeEach(() => {
  delete process.env.JST_DATABASE_PATH;
});

afterEach(async () => {
  const client = await import("@/lib/db/client").catch(() => null);
  client?.closeDatabase();
  delete process.env.JST_DATABASE_PATH;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("board catch-up", () => {
  it("waits a minute after the refusal, then checks boards highest priority first and adds what it finds", async () => {
    const { catchUp, context } = await load();
    const t0 = new Date("2026-08-17T12:00:00Z");
    catchUp.enqueueDeferredBoards([board("low"), board("high", 2)], "scan-1", t0);

    const paused = catchUp.getCatchUpStatus(t0);
    expect(paused.state).toBe("paused");
    expect(paused.total).toBe(2);
    expect(paused.hosts).toEqual(["Greenhouse"]);

    const fetched: string[] = [];
    const fetcher = async (url: string) => {
      fetched.push(nameOf(url));
      return payload(nameOf(url));
    };
    // Still inside the pause: nothing is sent.
    expect(await catchUp.runCatchUpTick({ fetcher, context, now: () => t0 })).toBe("waiting");
    expect(fetched).toEqual([]);

    const later = new Date(t0.getTime() + catchUp.INITIAL_BACKOFF_MS + 1000);
    expect(await catchUp.runCatchUpTick({ fetcher, context, now: () => later })).toBe("checked");
    expect(fetched).toEqual(["high"]);
    // Batch grows after a clean tick.
    expect(await catchUp.runCatchUpTick({ fetcher, context, now: () => later })).toBe("checked");
    expect(fetched).toEqual(["high", "low"]);
    expect(await catchUp.runCatchUpTick({ fetcher, context, now: () => later })).toBe("finished");

    const done = catchUp.getCatchUpStatus(later);
    expect(done.state).toBe("finished");
    expect(done.checked).toBe(2);
    expect(done.newJobsCount).toBe(2);
    expect(done.foundJobIds).toHaveLength(2);
  });

  it("backs off longer each time the host refuses again, and keeps the board", async () => {
    const { catchUp, context } = await load();
    const t0 = new Date("2026-08-17T12:00:00Z");
    catchUp.enqueueDeferredBoards([board("a")], "scan-1", t0);

    const refuse = async () => {
      throw new Error("HTTP 429");
    };
    const t1 = new Date(t0.getTime() + catchUp.INITIAL_BACKOFF_MS + 1);
    expect(await catchUp.runCatchUpTick({ fetcher: refuse, context, now: () => t1 })).toBe("rate_limited");

    const s1 = catchUp.getCatchUpStatus(t1);
    expect(s1.state).toBe("paused");
    expect(s1.remaining).toBe(1);
    expect(new Date(s1.pausedUntil!).getTime() - t1.getTime()).toBe(catchUp.INITIAL_BACKOFF_MS);

    const t2 = new Date(new Date(s1.pausedUntil!).getTime() + 1);
    await catchUp.runCatchUpTick({ fetcher: refuse, context, now: () => t2 });
    const s2 = catchUp.getCatchUpStatus(t2);
    expect(new Date(s2.pausedUntil!).getTime() - t2.getTime()).toBe(catchUp.INITIAL_BACKOFF_MS * 2);
  });

  it("drops a board that fails for another reason instead of retrying it forever", async () => {
    const { catchUp, context } = await load();
    const t0 = new Date("2026-08-17T12:00:00Z");
    catchUp.enqueueDeferredBoards([board("gone")], "scan-1", t0);
    const t1 = new Date(t0.getTime() + catchUp.INITIAL_BACKOFF_MS + 1);
    await catchUp.runCatchUpTick({
      fetcher: async () => {
        throw new Error("HTTP 404");
      },
      context,
      now: () => t1,
    });
    expect(catchUp.getCatchUpStatus(t1).remaining).toBe(0);
  });

  it("joins a second scan's boards to a check still running, without double counting", async () => {
    const { catchUp } = await load();
    const t0 = new Date("2026-08-17T12:00:00Z");
    catchUp.enqueueDeferredBoards([board("a"), board("b")], "scan-1", t0);
    catchUp.enqueueDeferredBoards([board("b"), board("c")], "scan-2", t0);
    const status = catchUp.getCatchUpStatus(t0);
    expect(status.total).toBe(3);
    expect(status.remaining).toBe(3);
    expect([...catchUp.getQueuedBoardNames()].sort()).toEqual(["a", "b", "c"]);
  });

  it("goes quiet a day after finishing", async () => {
    const { catchUp, context } = await load();
    const t0 = new Date("2026-08-17T12:00:00Z");
    catchUp.enqueueDeferredBoards([board("a")], "scan-1", t0);
    const t1 = new Date(t0.getTime() + catchUp.INITIAL_BACKOFF_MS + 1);
    const fetcher = async (url: string) => payload(nameOf(url));
    await catchUp.runCatchUpTick({ fetcher, context, now: () => t1 });
    await catchUp.runCatchUpTick({ fetcher, context, now: () => t1 });
    expect(catchUp.getCatchUpStatus(t1).state).toBe("finished");
    const nextDay = new Date(t1.getTime() + catchUp.FINISHED_VISIBLE_MS + 1);
    expect(catchUp.getCatchUpStatus(nextDay).state).toBe("idle");
  });
});
