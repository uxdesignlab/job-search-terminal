import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({}));

import { externalPostingSearchUrl, toBraveQuery } from "@/lib/scanner/email-posting-resolver";

describe("posting search query by engine", () => {
  const query = 'Piedmont Global Language Solutions "After Hours Accessibility Coordinator" -site:himalayas.app';

  it("rewrites the site exclusion into Brave's documented NOT form", () => {
    expect(toBraveQuery(query)).toBe(
      'Piedmont Global Language Solutions "After Hours Accessibility Coordinator" NOT site:himalayas.app',
    );
  });

  it("leaves hyphenated words alone", () => {
    expect(toBraveQuery("Front-end designer")).toBe("Front-end designer");
  });

  it("sends Google the query as written, quotes and all", () => {
    expect(decodeURIComponent(externalPostingSearchUrl(query).split("q=")[1])).toBe(query);
  });
});
