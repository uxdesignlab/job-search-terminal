import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTitleFilter,
  detectApi,
  parseAshby,
  parseGreenhouse,
  parseLever,
  runCareerOpsScanner
} from "../src/lib/scanner/careerops-scanner";
import { parseBrowserBoardScanFile, prepareBrowserBoardJobs } from "../src/lib/scanner/browser-board-importer";
import { shouldPurgeJob } from "../src/lib/db/queries";
import { buildJobPreferenceFilter } from "../src/lib/jobs/preference-fit";
import { normalizePreferredLocations } from "../src/lib/profile/locations";

assert.deepEqual(detectApi({ name: "Airtable", api: "https://boards-api.greenhouse.io/v1/boards/airtable/jobs" }), {
  type: "greenhouse",
  url: "https://boards-api.greenhouse.io/v1/boards/airtable/jobs"
});
assert.deepEqual(detectApi({ name: "Supabase", careers_url: "https://jobs.ashbyhq.com/supabase" }), {
  type: "ashby",
  url: "https://api.ashbyhq.com/posting-api/job-board/supabase?includeCompensation=true"
});
assert.deepEqual(detectApi({ name: "Spotify", careers_url: "https://jobs.lever.co/spotify" }), {
  type: "lever",
  url: "https://api.lever.co/v0/postings/spotify"
});

const filter = buildTitleFilter({
  positive: ["Design", "Product"],
  negative: ["Junior"]
});
assert.equal(filter("Principal Product Designer"), true);
assert.equal(filter("Junior Product Designer"), false);
assert.equal(filter("Backend Engineer"), false);

const preferenceFilter = buildJobPreferenceFilter({
  location: "Chicago, IL",
  preferredLocations: ["United States"],
  remotePreference: "local-or-remote",
  workPreferences: ["Remote first"],
  workModes: ["remote", "hybrid", "onsite"],
  constraints: ["Remote or selective hybrid"],
  dealBreakers: ["Onsite-only roles", "Junior IC scope"]
});
assert.equal(preferenceFilter({ title: "Principal Product Designer", location: "Remote US" }).accepted, true);
assert.equal(preferenceFilter({ title: "Principal Product Designer", location: "Remote Canada" }).accepted, true);
assert.equal(preferenceFilter({ title: "Product Design Lead", location: "Berlin, Germany" }).accepted, false);
assert.equal(preferenceFilter({ title: "Product Design Lead", location: "Chicago, IL" }).accepted, true);
assert.equal(preferenceFilter({ title: "Junior Product Designer", location: "Remote US" }).accepted, false);

const multiLocationPreferenceFilter = buildJobPreferenceFilter({
  location: "",
  preferredLocations: ["Nashville, Tennessee, United States", "Minsk, Belarus", "San Francisco, California, United States", "Melbourne, Victoria, Australia"],
  remotePreference: "all",
  workPreferences: [],
  workModes: ["remote", "hybrid", "onsite"],
  constraints: [],
  dealBreakers: []
});
assert.equal(multiLocationPreferenceFilter({ title: "Product Designer", location: "Remote Europe" }).accepted, true);
assert.equal(multiLocationPreferenceFilter({ title: "Product Designer", location: "Hybrid - San Francisco, CA" }).accepted, true);
assert.equal(multiLocationPreferenceFilter({ title: "Product Designer", location: "On-site - Melbourne, Australia" }).accepted, true);
assert.equal(multiLocationPreferenceFilter({ title: "Product Designer", location: "Hybrid - Berlin, Germany" }).accepted, false);
assert.equal(multiLocationPreferenceFilter({ title: "Product Designer", location: "On-site - London, United Kingdom" }).accepted, false);
assert.deepEqual(normalizePreferredLocations(["Nashville", "Tennessee", "United States"]), ["Nashville, Tennessee, United States"]);
assert.deepEqual(normalizePreferredLocations(["Nashville", "TN", "Minsk", "Belarus"]), ["Nashville, TN", "Minsk, Belarus"]);
assert.equal(multiLocationPreferenceFilter({ title: "Product Designer", location: "Hybrid - Nashville, TN" }).accepted, true);
assert.equal(multiLocationPreferenceFilter({ title: "Product Designer", location: "Hybrid - Chicago, Illinois, United States" }).accepted, false);

const internationalCityPreferenceFilter = buildJobPreferenceFilter({
  location: "",
  preferredLocations: ["Berlin, Germany"],
  remotePreference: "all",
  workPreferences: [],
  workModes: ["hybrid", "onsite"],
  constraints: [],
  dealBreakers: []
});
assert.equal(internationalCityPreferenceFilter({ title: "Product Designer", location: "Hybrid - Berlin, Germany" }).accepted, true);
assert.equal(internationalCityPreferenceFilter({ title: "Product Designer", location: "Hybrid - Munich, Germany" }).accepted, false);
assert.equal(
  shouldPurgeJob(
    { fit_score: 0, status: "Found", location: "London, United Kingdom", archived: 0 },
    { belowScore: 100, statuses: ["Found", "Reviewed"], locationKeywords: ["Nashville"] }
  ),
  true
);
assert.equal(
  shouldPurgeJob(
    { fit_score: 0, status: "Found", location: "Nashville, TN", archived: 0 },
    { belowScore: 100, statuses: ["Found", "Reviewed"], locationKeywords: ["Nashville"] }
  ),
  false
);
assert.equal(
  shouldPurgeJob(
    { fit_score: 0, status: "Found", location: "Remote United States", archived: 0 },
    { belowScore: 100, statuses: ["Found", "Reviewed"], locationKeywords: ["Nashville"] }
  ),
  false
);

assert.equal(
  parseGreenhouse({ jobs: [{ title: "UX Researcher", absolute_url: "https://example.com/ux", location: { name: "Remote" } }] }, "Example")[0]
    .title,
  "UX Researcher"
);
assert.equal(parseAshby({ jobs: [{ title: "Design Manager", jobUrl: "https://example.com/design", location: "Remote" }] }, "Example")[0].url, "https://example.com/design");
assert.equal(parseLever([{ text: "Product Design Lead", hostedUrl: "https://example.com/lead", categories: { location: "US" } }], "Example")[0].location, "US");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8"));
}

function emptyDedupKeys() {
  return {
    urls: new Set<string>(),
    companyRoles: new Set<string>(),
    companyRoleLocations: new Set<string>(),
    urlToIds: new Map<string, string[]>(),
    originalPostingKeyToIds: new Map<string, string[]>(),
    companyRoleLocationToIds: new Map<string, string[]>()
  };
}

const legacyLinkedInScan = parseBrowserBoardScanFile(readFixture("linkedin-legacy-scan.json"), "linkedin");
const legacyLinkedInJobs = prepareBrowserBoardJobs(legacyLinkedInScan, {
  dedup: emptyDedupKeys(),
  now: new Date("2026-05-11T12:00:00Z")
});
assert.equal(legacyLinkedInScan.source, "linkedin");
assert.equal(legacyLinkedInJobs.jobs[0].source, "linkedin-claude-scan");
assert.equal(legacyLinkedInJobs.jobs[0].url, "https://www.linkedin.com/jobs/view/9000000001/");

const wellfoundScan = parseBrowserBoardScanFile(readFixture("wellfound-browser-scan.json"));
const sharedDedup = emptyDedupKeys();
const wellfoundJobs = prepareBrowserBoardJobs(wellfoundScan, {
  dedup: sharedDedup,
  now: new Date("2026-05-11T12:05:00Z")
});
assert.equal(wellfoundJobs.jobs[0].source, "wellfound-browser-scan");
assert.equal(wellfoundJobs.jobs[0].url, "https://job-boards.greenhouse.io/acmeai/jobs/1234567");
assert.equal(wellfoundJobs.jobs[0].sourceUrl, "https://wellfound.com/jobs/100-product-design-lead");
assert.equal(wellfoundJobs.jobs[0].originalPostingKey, "greenhouse:acmeai:1234567");

const workAtAStartupScan = parseBrowserBoardScanFile(readFixture("workatastartup-browser-scan.json"));
const workAtAStartupJobs = prepareBrowserBoardJobs(workAtAStartupScan, {
  dedup: sharedDedup,
  now: new Date("2026-05-11T12:10:00Z")
});
assert.equal(workAtAStartupJobs.jobs[0].source, "workatastartup-browser-scan");
assert.equal(workAtAStartupJobs.jobs[0].url, "https://www.workatastartup.com/jobs/200-founding-designer");
assert.equal(workAtAStartupJobs.jobs[0].originalPostingKey, "workatastartup:200-founding-designer");
assert.equal(workAtAStartupJobs.jobs[1].isDuplicate, true);
assert.deepEqual(workAtAStartupJobs.jobs[1].duplicateOf, [wellfoundJobs.jobs[0].id]);

const glassdoorScan = parseBrowserBoardScanFile(readFixture("glassdoor-browser-scan.json"));
const glassdoorJobs = prepareBrowserBoardJobs(glassdoorScan, {
  dedup: sharedDedup,
  now: new Date("2026-05-11T12:15:00Z")
});
assert.equal(glassdoorJobs.jobs[0].source, "glassdoor-browser-scan");
assert.equal(glassdoorJobs.jobs[0].url, "https://www.glassdoor.com/job-listing/product-design-manager-acme-JV_IC1128808_KO0,22_KE23,27.htm");
assert.equal(glassdoorJobs.jobs[0].sourceUrl, "https://www.glassdoor.com/job-listing/product-design-manager-acme-JV_IC1128808_KO0,22_KE23,27.htm");
assert.equal(glassdoorJobs.jobs[0].originalPostingKey, "glassdoor:product-design-manager-acme-JV_IC1128808_KO0,22_KE23,27.htm");

const indeedScan = parseBrowserBoardScanFile(readFixture("indeed-browser-scan.json"));
const indeedJobs = prepareBrowserBoardJobs(indeedScan, {
  dedup: sharedDedup,
  now: new Date("2026-05-11T12:20:00Z")
});
assert.equal(indeedJobs.jobs[0].source, "indeed-browser-scan");
assert.equal(indeedJobs.jobs[0].url, "https://job-boards.greenhouse.io/acmeai/jobs/1234567");
assert.equal(indeedJobs.jobs[0].sourceUrl, "https://www.indeed.com/viewjob?jk=abc123def456");
assert.equal(indeedJobs.jobs[0].originalPostingKey, "greenhouse:acmeai:1234567");
assert.equal(indeedJobs.jobs[0].isDuplicate, true);
assert.equal(indeedJobs.jobs[0].duplicateOf?.includes(wellfoundJobs.jobs[0].id), true);

const monsterScan = parseBrowserBoardScanFile(readFixture("monster-browser-scan.json"));
const monsterJobs = prepareBrowserBoardJobs(monsterScan, {
  dedup: sharedDedup,
  now: new Date("2026-05-11T12:25:00Z")
});
assert.equal(monsterJobs.jobs[0].source, "monster-browser-scan");
assert.equal(monsterJobs.jobs[0].url, "https://www.monster.com/job-openings/senior-product-designer-remote-us--987654");
assert.equal(monsterJobs.jobs[0].sourceUrl, "https://www.monster.com/job-openings/senior-product-designer-remote-us--987654");
assert.equal(monsterJobs.jobs[0].originalPostingKey, "monster:senior-product-designer-remote-us--987654");

const fiveDayOldBrowserScan = parseBrowserBoardScanFile({
  metadata: {
    source: "linkedin",
    scanTimestamp: "2026-05-31T12:00:00Z",
    scanDurationSeconds: 10,
    totalJobsDiscovered: 1,
    searchCriteria: {},
  },
  jobs: [{
    company: "Past Week Company",
    position: "Product Designer",
    sourceUrl: "https://www.linkedin.com/jobs/view/9000000999/",
    discoveredAt: "2026-05-31T12:00:00Z",
    datePosted: "2026-05-26T12:00:00Z",
  }],
});
assert.equal(prepareBrowserBoardJobs(fiveDayOldBrowserScan, {
  dedup: emptyDedupKeys(),
  now: new Date("2026-05-31T12:00:00Z"),
}).jobs.length, 1);
assert.equal(prepareBrowserBoardJobs(fiveDayOldBrowserScan, {
  dedup: emptyDedupKeys(),
  freshnessWindowHours: 72,
  now: new Date("2026-05-31T12:00:00Z"),
}).staleFiltered, 1);

async function main() {
  const result = await runCareerOpsScanner({
    persist: false,
    fetcher: async (url) => {
      if (url.includes("greenhouse")) {
        return {
          jobs: [
            {
              title: "Principal Product Designer",
              absolute_url: `${url}/principal-product-designer`,
              location: { name: "Remote US" }
            },
            {
              title: "Junior Product Designer",
              absolute_url: `${url}/junior-product-designer`,
              location: { name: "Remote US" }
            },
            {
              title: "Product Design Lead",
              absolute_url: `${url}/product-design-lead-canada`,
              location: { name: "Remote Canada" }
            }
          ]
        };
      }

      if (url.includes("ashby")) {
        return {
          jobs: [
            {
              title: "Design Systems Lead",
              jobUrl: `${url}/design-systems-lead`,
              location: "Remote"
            }
          ]
        };
      }

      return [
        {
          text: "UX Research Lead",
          hostedUrl: `${url}/ux-research-lead`,
          categories: { location: "United States" }
        },
        {
          text: "Product Design Lead",
          hostedUrl: `${url}/product-design-lead-berlin`,
          categories: { location: "Berlin, Germany" }
        }
      ];
    },
    profile: {
      location: "Chicago, IL",
      preferredLocations: ["United States"],
      remotePreference: "local-or-remote",
      workPreferences: ["Remote first"],
      workModes: ["remote", "hybrid", "onsite"],
      constraints: ["Remote or selective hybrid"],
      dealBreakers: ["Onsite-only roles", "Junior IC scope"]
    }
  });

  assert.ok(result.companiesScanned > 0);
  assert.ok(result.totalJobsFound > 0);
  assert.ok(result.filteredCount > 0);
  assert.ok(result.newJobsCount > 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.jobs.some((job) => job.location === "Remote Canada"), true);
  assert.equal(result.jobs.some((job) => job.location === "Berlin, Germany"), false);

  console.log("Scanner check passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
