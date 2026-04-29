import assert from "node:assert/strict";
import {
  buildTitleFilter,
  detectApi,
  parseAshby,
  parseGreenhouse,
  parseLever,
  runCareerOpsScanner
} from "../src/lib/scanner/careerops-scanner";

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
        }
      ];
    }
  });

  assert.ok(result.companiesScanned > 0);
  assert.ok(result.totalJobsFound > 0);
  assert.ok(result.filteredCount > 0);
  assert.ok(result.newJobsCount > 0);
  assert.equal(result.errors.length, 0);

  console.log("Scanner check passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
