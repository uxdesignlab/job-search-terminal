import { describe, expect, it } from "vitest";
import { buildResumeExcerpts } from "@/lib/evaluation/llm-evaluator";

const lane = (name: string, chars = 9000) => ({
  name,
  extractedText: `${name} `.repeat(Math.ceil(chars / (name.length + 1))).slice(0, chars),
  activeStatus: true,
});

describe("resume excerpts sent to the evaluator", () => {
  it("includes every active lane, not the first two", () => {
    // All active lane names are offered for the recommendation and confidence is
    // derived from every lane's text, so dropping a lane by array position left
    // the model choosing between lanes it had not read while the run still
    // called itself well-evidenced.
    const excerpts = buildResumeExcerpts([lane("Principal"), lane("UX-leadership"), lane("Teaching")]);
    expect(excerpts.map((e) => e.name)).toEqual(["Principal", "UX-leadership", "Teaching"]);
  });

  it("keeps up to three lanes at the full excerpt length", () => {
    expect(buildResumeExcerpts([lane("Principal")])[0].excerpt).toHaveLength(1800);
    expect(buildResumeExcerpts([lane("Principal"), lane("Teaching")])[1].excerpt).toHaveLength(1800);
    expect(buildResumeExcerpts([lane("Principal"), lane("UX-leadership"), lane("Teaching")])[2].excerpt)
      .toHaveLength(1800);
  });

  it.each([[3], [6], [8], [12], [30]])("keeps the combined excerpts within budget at %i lanes", (count) => {
    // A per-lane minimum that survives division is not a budget: a 700-character
    // floor already overshot at eight lanes and then grew without limit, and lane
    // creation has no ceiling.
    const excerpts = buildResumeExcerpts(Array.from({ length: count }, (_, i) => lane(`lane${i}`)));

    expect(excerpts).toHaveLength(count);
    const total = excerpts.reduce((sum, e) => sum + e.excerpt.length, 0);
    expect(total).toBeLessThanOrEqual(5400);
    for (const excerpt of excerpts) expect(excerpt.excerpt.length).toBeGreaterThan(0);
  });

  it("skips inactive lanes and stubs too short to be evidence", () => {
    const excerpts = buildResumeExcerpts([
      lane("Principal"),
      { ...lane("Retired"), activeStatus: false },
      { name: "Stub", extractedText: "too short", activeStatus: true },
    ]);
    expect(excerpts.map((e) => e.name)).toEqual(["Principal"]);
  });
});
