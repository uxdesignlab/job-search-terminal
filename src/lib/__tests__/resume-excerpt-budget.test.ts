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

  it("keeps one and two lanes at the full excerpt length", () => {
    expect(buildResumeExcerpts([lane("Principal")])[0].excerpt).toHaveLength(1800);
    expect(buildResumeExcerpts([lane("Principal"), lane("Teaching")])[1].excerpt).toHaveLength(1800);
  });

  it("shares a bounded budget once there are many lanes", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((n) => lane(n));
    const excerpts = buildResumeExcerpts(many);
    expect(excerpts).toHaveLength(6);
    for (const excerpt of excerpts) {
      expect(excerpt.excerpt.length).toBeLessThanOrEqual(1800);
      expect(excerpt.excerpt.length).toBeGreaterThanOrEqual(700);
    }
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
