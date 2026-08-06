import { describe, expect, it } from "vitest";
import {
  formatHimalayasLocation,
  formatHimalayasSalary,
  himalayasPubDateToIso,
  normalizeHimalayasJob,
  parseHimalayasPayload,
} from "@/lib/scanner/himalayas-scanner";
import { buildJobPreferenceFilter, type JobPreferenceProfile } from "@/lib/jobs/preference-fit";

describe("parseHimalayasPayload", () => {
  it("parses ordinary JSON", () => {
    expect(parseHimalayasPayload('{"jobs":[{"title":"Designer"}]}')).toEqual({ jobs: [{ title: "Designer" }] });
  });

  it("survives the raw control characters the API emits inside strings", () => {
    // Verbatim shape of the failure: a literal newline inside a JSON string,
    // which JSON.parse rejects with "Invalid control character".
    const raw = '{"jobs":[{"title":"Product\nDesigner","excerpt":"line1\tline2"}]}';
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = parseHimalayasPayload(raw) as { jobs: Array<{ title: string; excerpt: string }> };
    expect(parsed.jobs[0].title).toBe("Product Designer");
    expect(parsed.jobs[0].excerpt).toBe("line1 line2");
  });

  it("drops non-whitespace control characters rather than substituting them", () => {
    const parsed = parseHimalayasPayload('{"a":"xy"}') as { a: string };
    expect(parsed.a).toBe("xy");
  });
});

describe("himalayasPubDateToIso", () => {
  it("treats pubDate as epoch seconds, not milliseconds", () => {
    // 1786041265s is 2026-08-06T18:34:25Z (verified against a live payload);
    // misreading it as milliseconds would land in 1970.
    expect(himalayasPubDateToIso(1786041265)).toBe("2026-08-06T18:34:25.000Z");
    expect(himalayasPubDateToIso(1786041265000)).not.toBe("2026-08-06T18:34:25.000Z");
  });

  it("returns null for missing or non-numeric values", () => {
    expect(himalayasPubDateToIso(undefined)).toBeNull();
    expect(himalayasPubDateToIso("1786041265")).toBeNull();
    expect(himalayasPubDateToIso(Number.NaN)).toBeNull();
  });
});

describe("formatHimalayasLocation", () => {
  it("treats an empty restriction list as unrestricted remote", () => {
    expect(formatHimalayasLocation([])).toBe("Remote");
    expect(formatHimalayasLocation(undefined)).toBe("Remote");
  });

  it("marks each restricted country as remote", () => {
    expect(formatHimalayasLocation(["United States"])).toBe("United States (Remote)");
  });

  it("joins several countries with a separator the preference filter splits on", () => {
    expect(formatHimalayasLocation(["United States", "Canada"])).toBe(
      "United States (Remote); Canada (Remote)"
    );
  });
});

describe("formatHimalayasSalary", () => {
  it("formats a range, a floor, and a ceiling", () => {
    expect(formatHimalayasSalary(120000, 160000, "USD")).toBe("USD 120k–160k/yr");
    expect(formatHimalayasSalary(120000, null, "USD")).toBe("USD 120k+/yr");
    expect(formatHimalayasSalary(null, 160000, "EUR")).toBe("up to EUR 160k/yr");
  });

  it("returns empty when no salary is published", () => {
    expect(formatHimalayasSalary(null, null, null)).toBe("");
    expect(formatHimalayasSalary(0, 0, "USD")).toBe("");
  });
});

describe("normalizeHimalayasJob", () => {
  const raw = {
    title: "Senior Product Designer",
    companyName: "Acme",
    locationRestrictions: ["United States"],
    pubDate: 1786041265,
    applicationLink: "https://himalayas.app/companies/acme/jobs/spd",
    guid: "https://himalayas.app/companies/acme/jobs/spd",
    description: "Full description",
    minSalary: 150000,
    maxSalary: 180000,
    currency: "USD",
  };

  it("maps a complete posting", () => {
    const job = normalizeHimalayasJob(raw);
    expect(job).toMatchObject({
      company: "Acme",
      position: "Senior Product Designer",
      location: "United States (Remote)",
      datePosted: "2026-08-06T18:34:25.000Z",
      salaryNotes: "USD 150k–180k/yr",
    });
  });

  it("falls back to the excerpt when no description is present", () => {
    const job = normalizeHimalayasJob({ ...raw, description: undefined, excerpt: "Short blurb" });
    expect(job?.jobDescription).toBe("Short blurb");
  });

  it("rejects postings missing a title, company, or url", () => {
    expect(normalizeHimalayasJob({ ...raw, title: undefined })).toBeNull();
    expect(normalizeHimalayasJob({ ...raw, companyName: "  " })).toBeNull();
    expect(normalizeHimalayasJob({ ...raw, applicationLink: undefined, guid: undefined })).toBeNull();
  });
});

describe("Himalayas locations against the preference filter", () => {
  const nashville: JobPreferenceProfile = {
    location: "Nashville, TN",
    preferredLocations: ["Tennessee, United States"],
    remotePreference: "all",
    workPreferences: [],
    workModes: ["remote", "hybrid", "onsite"],
    constraints: [],
    dealBreakers: [],
  };
  const accepts = (location: string) =>
    buildJobPreferenceFilter(nashville)({ title: "Product Designer", location }).accepted;

  it("accepts unrestricted and US-restricted remote roles", () => {
    expect(accepts(formatHimalayasLocation([]))).toBe(true);
    expect(accepts(formatHimalayasLocation(["United States"]))).toBe(true);
  });

  it("accepts a multi-country role that includes the US", () => {
    expect(accepts(formatHimalayasLocation(["Germany", "United States"]))).toBe(true);
  });

  it("rejects region-restricted remote roles the user cannot take", () => {
    expect(accepts(formatHimalayasLocation(["Germany"]))).toBe(false);
    expect(accepts(formatHimalayasLocation(["United Kingdom", "Netherlands"]))).toBe(false);
    expect(accepts(formatHimalayasLocation(["Philippines"]))).toBe(false);
    expect(accepts(formatHimalayasLocation(["India", "Pakistan"]))).toBe(false);
  });

  it("covers the real restriction vocabulary the feed uses", () => {
    // The live feed's most common values, sampled directly from the API.
    const inScope = ["United States"];
    const outOfScope = [
      "Canada", "Germany", "United Kingdom", "Mexico", "Philippines", "Poland",
      "India", "Colombia", "Spain", "Brazil", "Argentina", "South Africa",
      "Portugal", "Australia", "Czechia", "North Macedonia", "Netherlands",
    ];
    for (const country of inScope) expect(accepts(formatHimalayasLocation([country]))).toBe(true);
    for (const country of outOfScope) {
      expect(accepts(formatHimalayasLocation([country]))).toBe(false);
    }
  });

  it("rejects region-restricted remote roles once work modes are cleared", () => {
    // The remote-only path does check the restriction, so the data supports it.
    const remoteOnly: JobPreferenceProfile = { ...nashville, workModes: [], remotePreference: "remote-only" };
    const strict = (location: string) =>
      buildJobPreferenceFilter(remoteOnly)({ title: "Product Designer", location }).accepted;
    expect(strict(formatHimalayasLocation(["Germany"]))).toBe(false);
    expect(strict(formatHimalayasLocation(["United States"]))).toBe(true);
    expect(strict(formatHimalayasLocation([]))).toBe(true);
  });
});
