import assert from "node:assert/strict";
import {
  buildTitleFilter,
  detectApi,
  parseAshby,
  parseGreenhouse,
  parseLever,
  runCareerOpsScanner
} from "../src/lib/scanner/careerops-scanner";
import { shouldPurgeJob } from "../src/lib/db/queries";
import { buildJobPreferenceFilter } from "../src/lib/jobs/preference-fit";

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
  constraints: ["Remote or selective hybrid"],
  dealBreakers: ["Onsite-only roles", "Junior IC scope"]
});
assert.equal(preferenceFilter({ title: "Principal Product Designer", location: "Remote US" }).accepted, true);
assert.equal(preferenceFilter({ title: "Principal Product Designer", location: "Remote Canada" }).accepted, false);
assert.equal(preferenceFilter({ title: "Product Design Lead", location: "Berlin, Germany" }).accepted, false);
assert.equal(preferenceFilter({ title: "Product Design Lead", location: "Chicago, IL" }).accepted, true);
assert.equal(preferenceFilter({ title: "Junior Product Designer", location: "Remote US" }).accepted, false);
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
      constraints: ["Remote or selective hybrid"],
      dealBreakers: ["Onsite-only roles", "Junior IC scope"]
    }
  });

  assert.ok(result.companiesScanned > 0);
  assert.ok(result.totalJobsFound > 0);
  assert.ok(result.filteredCount > 0);
  assert.ok(result.newJobsCount > 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.jobs.some((job) => job.location === "Remote Canada"), false);
  assert.equal(result.jobs.some((job) => job.location === "Berlin, Germany"), false);

  console.log("Scanner check passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
