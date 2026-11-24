import { describe, expect, it } from "vitest";
import {
  HttpStatusError,
  runCareerOpsScanner,
  runHostPool,
  type DeferredBoard,
} from "@/lib/scanner/careerops-scanner";
import { classifyScanErrorMessage } from "@/lib/scan-error-category";
import type { JobPreferenceProfile } from "@/lib/jobs/preference-fit";

const CONFIG_PATH = "src/lib/__tests__/fixtures/careerops-rate-limit-portals.yml";

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

const boardName = (url: string) => {
  const gh = url.match(/boards\/([^/]+)\/jobs/);
  if (gh) return gh[1];
  return url.match(/job-board\/([^?]+)/)?.[1] ?? url;
};

function payloadFor(url: string) {
  const name = boardName(url);
  if (url.includes("greenhouse")) {
    return {
      jobs: [
        {
          title: "Director, Product Design",
          absolute_url: `https://job-boards.greenhouse.io/${name}/jobs/1`,
          location: { name: "Remote" },
          updated_at: "2026-08-16T00:00:00Z",
        },
      ],
    };
  }
  return {
    jobs: [
      {
        title: "Director, Product Design",
        jobUrl: `https://jobs.ashbyhq.com/${name}/1`,
        location: "Remote",
        publishedAt: "2026-08-16T00:00:00Z",
      },
    ],
  };
}

function scan(options: Partial<Parameters<typeof runCareerOpsScanner>[0]> & { fetcher: (url: string) => Promise<unknown> }) {
  return runCareerOpsScanner({
    persist: false,
    configPath: CONFIG_PATH,
    profile,
    now: new Date("2026-08-17T12:00:00Z"),
    freshnessWindowHours: 168,
    ...options,
  });
}

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("runHostPool", () => {
  it("closes a host at its first refusal and returns every board it did not finish", async () => {
    const started: string[] = [];
    const { deferred } = await runHostPool(
      new Map([["gh", ["g1", "g2", "g3", "g4"]]]),
      1,
      { gh: 1 },
      async (item) => {
        started.push(item);
        return item === "g2" ? "rate_limited" : "ok";
      },
    );
    expect(started).toEqual(["g1", "g2"]);
    expect(deferred.get("gh")).toEqual(["g2", "g3", "g4"]);
  });

  it("gives a closed host's slots to the hosts still answering", async () => {
    const inFlight: Record<string, number> = { gh: 0, ash: 0 };
    let maxAshAfterClose = 0;
    let ghClosed = false;
    const { deferred } = await runHostPool(
      new Map([
        ["gh", ["g1", "g2", "g3", "g4", "g5", "g6"]],
        ["ash", ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]],
      ]),
      4,
      { gh: 2, ash: 4 },
      async (item, host) => {
        inFlight[host]++;
        if (ghClosed && host === "ash") maxAshAfterClose = Math.max(maxAshAfterClose, inFlight.ash);
        await tick();
        inFlight[host]--;
        if (item === "g1") {
          ghClosed = true;
          return "rate_limited";
        }
        return "ok";
      },
    );
    // With Greenhouse closed, Ashby used the whole pool, not just its old share.
    expect(maxAshAfterClose).toBe(4);
    expect(deferred.get("ash")).toEqual([]);
    expect(deferred.get("gh")?.length).toBeGreaterThanOrEqual(4);
  });

  it("never exceeds the pool or a host's cap", async () => {
    let total = 0;
    let maxTotal = 0;
    const perHost: Record<string, number> = { a: 0, b: 0 };
    const maxPerHost: Record<string, number> = { a: 0, b: 0 };
    await runHostPool(
      new Map([
        ["a", Array.from({ length: 20 }, (_, i) => i)],
        ["b", Array.from({ length: 20 }, (_, i) => i)],
      ]),
      5,
      { a: 2, b: 4 },
      async (_item, host) => {
        total++;
        perHost[host]++;
        maxTotal = Math.max(maxTotal, total);
        maxPerHost[host] = Math.max(maxPerHost[host], perHost[host]);
        await tick();
        total--;
        perHost[host]--;
        return "ok";
      },
    );
    expect(maxTotal).toBeLessThanOrEqual(5);
    expect(maxPerHost.a).toBeLessThanOrEqual(2);
    expect(maxPerHost.b).toBeLessThanOrEqual(4);
  });

  it("finishes at once with nothing to do", async () => {
    const { deferred } = await runHostPool(new Map(), 3, {}, async () => "ok");
    expect(deferred.size).toBe(0);
  });
});

describe("runCareerOpsScanner with a rate-limited host", () => {
  it("hands Greenhouse's unchecked boards to the background check and keeps Ashby going", async () => {
    const fetched: string[] = [];
    let handed: DeferredBoard[] = [];
    let lastProgress = { checked: 0, total: 0, moved: 0 };
    const result = await scan({
      fetcher: async (url) => {
        const name = boardName(url);
        fetched.push(name);
        if (name === "gh-b") throw new HttpStatusError(429);
        return payloadFor(url);
      },
      onDeferred: (boards) => {
        handed = boards;
      },
      onBoardProgress: (checked, total, moved) => {
        lastProgress = { checked, total, moved: moved.greenhouse ?? 0 };
      },
    });

    // The refusal is not an error, so the scan does not read as "with issues".
    expect(result.errors).toEqual([]);
    expect(result.status).toBe("completed");
    // Ashby was never affected.
    expect(fetched).toContain("ash-a");
    expect(fetched).toContain("ash-b");
    // gh-b and every Greenhouse board not yet started were handed on.
    expect(handed.map((b) => b.name)).toContain("gh-b");
    expect(handed.every((b) => b.apiType === "greenhouse")).toBe(true);
    expect(result.rateLimited).toEqual([{ host: "greenhouse", deferred: handed.length, total: 6 }]);
    // Progress drops the handed-on boards from the total, so it ends complete.
    expect(lastProgress).toEqual({ checked: 8 - handed.length, total: 8 - handed.length, moved: handed.length });
    // Handed-on boards were not scanned, so they are not counted as such.
    expect(result.companiesScanned).toBe(8 - handed.length);
    // Nothing refused was fetched after the lane closed... except boards already in flight.
    expect(fetched.filter((n) => n.startsWith("gh-")).length).toBeLessThanOrEqual(6);
  });

  it("reports refusals as rate-limited errors when no background check is wired", async () => {
    const result = await scan({
      fetcher: async (url) => {
        if (url.includes("greenhouse")) throw new HttpStatusError(429);
        return payloadFor(url);
      },
    });
    expect(result.rateLimited).toEqual([]);
    expect(result.errors.length).toBe(6);
    expect(result.errors.every((e) => e.category === "rate_limited")).toBe(true);
  });

  it("checks the most promising boards first within a host's lane", async () => {
    const order: string[] = [];
    await scan({
      fetcher: async (url) => {
        order.push(boardName(url));
        return payloadFor(url);
      },
      priorities: new Map([["gh-f", 2], ["gh-e", 1]]),
    });
    const gh = order.filter((n) => n.startsWith("gh-"));
    expect(gh.slice(0, 2)).toEqual(["gh-f", "gh-e"]);
  });

  it("leaves boards the background check already holds alone", async () => {
    const fetched: string[] = [];
    const result = await scan({
      fetcher: async (url) => {
        fetched.push(boardName(url));
        return payloadFor(url);
      },
      skipNames: new Set(["gh-a", "gh-c"]),
    });
    expect(fetched).not.toContain("gh-a");
    expect(fetched).not.toContain("gh-c");
    expect(result.alreadyQueued).toBe(2);
    expect(result.companiesScanned).toBe(6);
  });
});

describe("board progress", () => {
  it("reports every checked board against the total, starting from zero", async () => {
    const calls: Array<[number, number]> = [];
    await scan({ fetcher: async (url) => payloadFor(url), onBoardProgress: (c, t) => calls.push([c, t]) });
    expect(calls[0]).toEqual([0, 8]);
    expect(calls.at(-1)).toEqual([8, 8]);
  });
});

describe("classifyScanErrorMessage", () => {
  it("treats HTTP 429 as rate limited, never as a dead board", () => {
    expect(classifyScanErrorMessage("HTTP 429")).toBe("rate_limited");
    expect(classifyScanErrorMessage("HTTP 404")).toBe("dead_or_unreachable");
  });
});
