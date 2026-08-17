import { describe, expect, it } from "vitest";
import {
  emptyDedupKeys,
  parseAshby,
  runCareerOpsScanner,
  type JobDedupKeys,
} from "@/lib/scanner/careerops-scanner";
import type { JobPreferenceProfile } from "@/lib/jobs/preference-fit";

const CONFIG_PATH = "src/lib/__tests__/fixtures/careerops-dedupe-portals.yml";
const ASHBY_BOARD = "https://api.ashbyhq.com/posting-api/job-board/givebutter?includeCompensation=true";

const OLD_URL = "https://jobs.ashbyhq.com/givebutter/ea7b5e5d-972e-4f8a-a9d9-71542d60177e";
const NEW_URL = "https://jobs.ashbyhq.com/givebutter/8532da59-a4db-453f-88b6-4b65e225383e";

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

/** The board as it stands today: one re-posted Director role under a new req id. */
const boardPayload = {
  jobs: [
    {
      title: "Director, Product Design",
      jobUrl: NEW_URL,
      location: "Remote",
      publishedAt: "2026-08-13T15:23:35.404+00:00",
    },
  ],
};

/** Seeds the dedup set with one existing Givebutter row at the *old* req URL. */
function dedupWithExistingDirector(status: string): JobDedupKeys {
  const dedup = emptyDedupKeys();
  const id = "job-existing";
  dedup.urls.add(OLD_URL);
  dedup.companyRoleLocationToIds.set("givebutter::director, product design::remote", [id]);
  dedup.companyRoleToIds.set("givebutter::director, product design", [id]);
  if (status !== "Applied") dedup.openIds.add(id);
  return dedup;
}

async function scan(dedup: JobDedupKeys) {
  return runCareerOpsScanner({
    persist: false,
    configPath: CONFIG_PATH,
    dedup,
    profile,
    now: new Date("2026-08-17T12:00:00Z"),
    freshnessWindowHours: 168,
    fetcher: async () => boardPayload,
  });
}

describe("parseAshby", () => {
  it("reads the posted date from publishedAt, the field Ashby actually sends", () => {
    // Reading `publishedDate` — which the posting API has never returned — left
    // every Ashby job undated, so freshness classification silently never ran.
    const [job] = parseAshby(boardPayload, "givebutter");
    expect(job.datePosted).toBe("2026-08-13T15:23:35.404+00:00");
  });

  it("leaves datePosted null when the board genuinely omits it", () => {
    const [job] = parseAshby({ jobs: [{ title: "X", jobUrl: "u", location: "Remote" }] }, "acme");
    expect(job.datePosted).toBeNull();
  });
});

describe("careerops dedupe", () => {
  it("admits a re-posted requisition once the earlier one has been applied to", async () => {
    const result = await scan(dedupWithExistingDirector("Applied"));

    expect(result.duplicateCount).toBe(0);
    expect(result.repostCount).toBe(1);
    expect(result.jobs.map((job) => job.url)).toEqual([NEW_URL]);
  });

  it("still suppresses the same role while the existing row is live", async () => {
    const result = await scan(dedupWithExistingDirector("Found"));

    expect(result.duplicateCount).toBe(1);
    expect(result.repostCount).toBe(0);
    expect(result.jobs).toHaveLength(0);
  });

  it("treats an identical posting URL as a duplicate whatever the status", async () => {
    const dedup = dedupWithExistingDirector("Applied");
    dedup.urls.add(NEW_URL);
    const result = await scan(dedup);

    expect(result.duplicateCount).toBe(1);
    expect(result.repostCount).toBe(0);
    expect(result.jobs).toHaveLength(0);
  });

  it("does not count a first sighting of a role as a re-post", async () => {
    const result = await scan(emptyDedupKeys());

    expect(result.repostCount).toBe(0);
    expect(result.jobs).toHaveLength(1);
  });
});

describe("careerops scan target", () => {
  it("derives the Ashby posting API from the careers URL", async () => {
    const seen: string[] = [];
    await runCareerOpsScanner({
      persist: false,
      configPath: CONFIG_PATH,
      dedup: emptyDedupKeys(),
      profile,
      fetcher: async (url) => {
        seen.push(url);
        return boardPayload;
      },
    });
    expect(seen).toEqual([ASHBY_BOARD]);
  });
});
