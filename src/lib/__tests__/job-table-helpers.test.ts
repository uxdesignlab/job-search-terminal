import { describe, expect, it } from "vitest";
import type { JobRecord } from "@/lib/db/types";
import { isHttpPostingUrl } from "@/lib/jobs/posting-resolution";
import {
  getJobSourceLabel,
  getMainJobColOptions,
  getMainJobColValue,
  matchesMainJobColFilter,
} from "@/lib/job-table-helpers";

function job(source: string, sourceUrl = ""): JobRecord {
  return { source, sourceUrl } as JobRecord;
}

describe("job source display", () => {
  it("labels ATS sources that previously rendered blank", () => {
    expect(getJobSourceLabel(job("ashby-api"))).toBe("Ashby");
    expect(getJobSourceLabel(job("greenhouse-api"))).toBe("Greenhouse");
    expect(getJobSourceLabel(job("lever-api"))).toBe("Lever");
  });

  it("falls back to the originating site when the source string is unknown", () => {
    expect(getJobSourceLabel(job("some-scan", "https://www.linkedin.com/jobs/view/123"))).toBe("LinkedIn");
    expect(getJobSourceLabel(job("some-scan", "https://boards.greenhouse.io/acme/jobs/1"))).toBe("Greenhouse");
  });

  it("uses the bare hostname for sites it has no name for", () => {
    expect(getJobSourceLabel(job("some-scan", "https://careers.example.com/jobs/1"))).toBe("careers.example.com");
  });

  it("applies caller-supplied host labels ahead of the public list", () => {
    expect(
      getJobSourceLabel(job("some-scan", "https://careers.example.com/jobs/1"), [
        ["example.com", "Example Board"],
      ]),
    ).toBe("Example Board");
  });

  it("falls back to Scanner when there is no usable source URL", () => {
    expect(getJobSourceLabel(job("some-scan"))).toBe("Scanner");
    expect(getJobSourceLabel(job("some-scan", "not a URL"))).toBe("Scanner");
  });

  it("prefers the server-resolved label for display, sorting, and filtering", () => {
    const resolved = { ...job("some-scan", "https://careers.example.com/jobs/1"), sourceLabel: "Example Board" };
    expect(getMainJobColValue(resolved, "source")).toBe("Example Board");
  });

  it("always offers Scanner as a filter option so a cleared legacy filter stays reachable", () => {
    const jobs = [job("greenhouse-api"), job("linkedin-claude-scan", "https://linkedin.com/jobs/view/1")];
    expect(getMainJobColOptions(jobs, "source")).toEqual(["Greenhouse", "LinkedIn", "Scanner"]);
  });

  it("keeps legacy Scanner filters matching every non-browser-board source", () => {
    expect(matchesMainJobColFilter(job("greenhouse-api"), "source", new Set(["Scanner"]))).toBe(true);
    expect(
      matchesMainJobColFilter(
        job("linkedin-claude-scan", "https://linkedin.com/jobs/view/1"),
        "source",
        new Set(["Scanner"]),
      ),
    ).toBe(false);
  });

  it("only treats HTTP(S) source URLs as linkable", () => {
    expect(isHttpPostingUrl("https://example.com/jobs/123")).toBe(true);
    expect(isHttpPostingUrl("http://example.com/jobs/123")).toBe(true);
    expect(isHttpPostingUrl("email-alert://job/123")).toBe(false);
    expect(isHttpPostingUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpPostingUrl("not a URL")).toBe(false);
  });
});
