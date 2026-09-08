import { describe, expect, it } from "vitest";
import { greenhouseBoardTokenFromUrl, greenhouseJobId, htmlToText } from "@/lib/scanner/jd-fetcher";

describe("greenhouseJobId", () => {
  it("reads the id from a board-hosted URL", () => {
    expect(greenhouseJobId("https://job-boards.greenhouse.io/reddit/jobs/7644191")).toBe("7644191");
  });

  it("reads the id from the gh_jid on an employer's own careers URL", () => {
    // What the board API returns as `absolute_url`, and what the scanner stores.
    expect(
      greenhouseJobId("https://www.samsara.com/company/careers/roles/7839138?gh_jid=7839138"),
    ).toBe("7839138");
  });

  it("falls back to a trailing numeric path segment", () => {
    expect(greenhouseJobId("https://careers.example.com/roles/4821")).toBe("4821");
  });

  it("returns null when no id is present", () => {
    expect(greenhouseJobId("https://careers.example.com/roles/staff-designer")).toBeNull();
  });
});

describe("greenhouseBoardTokenFromUrl", () => {
  it("reads the token from a board URL", () => {
    expect(greenhouseBoardTokenFromUrl("https://job-boards.greenhouse.io/samsara/jobs/7839138")).toBe("samsara");
  });

  it("reads the token from the EU board host", () => {
    expect(greenhouseBoardTokenFromUrl("https://job-boards.eu.greenhouse.io/acme/jobs/12")).toBe("acme");
  });

  it("reads the token from the scan source's API URL", () => {
    expect(
      greenhouseBoardTokenFromUrl("https://boards-api.greenhouse.io/v1/boards/samsara/jobs"),
    ).toBe("samsara");
  });

  it("returns null for an employer's own careers URL, which names no board", () => {
    expect(
      greenhouseBoardTokenFromUrl("https://www.samsara.com/company/careers/roles/7839138?gh_jid=7839138"),
    ).toBeNull();
  });
});

describe("htmlToText", () => {
  it("strips ordinary markup", () => {
    expect(htmlToText("<p>Lead the team.</p><p>Ship the work.</p>")).toBe("Lead the team.\n\nShip the work.");
  });

  it("turns list items into bullets", () => {
    expect(htmlToText("<ul><li>Own the roadmap</li><li>Mentor designers</li></ul>")).toBe(
      "• Own the roadmap\n• Mentor designers",
    );
  });

  it("removes markup that arrived entity-escaped", () => {
    // Greenhouse returns `content` escaped. Stripping tags before decoding left them in
    // the saved text, which is how every fetched Greenhouse description became markup.
    const escaped = "&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;Who we are&lt;/p&gt;&lt;/div&gt;";
    expect(htmlToText(escaped)).toBe("Who we are");
  });

  it("keeps an ampersand that was double-escaped inside escaped markup", () => {
    expect(htmlToText("&lt;p&gt;Research &amp;amp; design&lt;/p&gt;")).toBe("Research & design");
  });

  it("decodes entities in unescaped markup", () => {
    expect(htmlToText("<p>Research &amp; design</p>")).toBe("Research & design");
  });
});
