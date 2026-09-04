import { describe, expect, it } from "vitest";
import {
  buildPeopleSearchPlan,
  candidateFitsSearchLane,
  parsePeopleSearchKeywords,
  PEOPLE_SHORTLIST_LIMIT,
  reportsToTitleFromDescription,
  titleKeywordsForPeopleSearch,
} from "@/lib/contacts/search-details";

describe("people search details", () => {
  it("derives the function and a useful adjacent term without seniority filler", () => {
    expect(titleKeywordsForPeopleSearch("Senior Director of Product Design")).toEqual([
      "product design",
      "user experience",
    ]);
  });

  it("returns no default when the job has no useful role words", () => {
    expect(titleKeywordsForPeopleSearch("Senior II")).toEqual([]);
  });

  it("parses, deduplicates, and bounds edited role keywords", () => {
    expect(parsePeopleSearchKeywords("design leadership, recruiter, design leadership")).toEqual([
      "design",
      "recruiter",
    ]);
    expect(parsePeopleSearchKeywords("alpha,beta,gamma,delta,epsilon")).toHaveLength(4);
  });

  it("reads the reports-to title from the job description", () => {
    expect(reportsToTitleFromDescription(
      "Location: Remote | Reports to: VP, Experience & Insights\n\nAbout the role",
    )).toBe("vp experience and insights");
  });

  it("builds five targeted slots for an outreach shortlist", () => {
    const plan = buildPeopleSearchPlan({
      jobTitle: "Sr. Director, User Experience",
      reportsToTitle: "VP, Experience & Insights",
      roleKeywords: ["user experience", "product design"],
    });

    expect(plan.map((lane) => [lane.id, lane.limit])).toEqual([
      ["hiring_leader", 2],
      ["team_leader", 2],
      ["recruiter", 1],
    ]);
    expect(plan.reduce((total, lane) => total + lane.limit, 0)).toBe(PEOPLE_SHORTLIST_LIMIT);
    expect(plan[0].titleKeywords[0]).toBe("vp experience and insights");
    expect(plan[0].titleKeywords).toContain("vp user experience");
    expect(plan[1].titleKeywords).toContain("manager product design");
    expect(plan[2].titleKeywords).toContain("talent acquisition partner user experience");
  });

  it("rejects broad matches that do not fit the promised shortlist slot", () => {
    expect(candidateFitsSearchLane("hiring_leader", "VP of Experience & Insights")).toBe(true);
    expect(candidateFitsSearchLane("hiring_leader", "Senior Technical Recruiter")).toBe(false);
    expect(candidateFitsSearchLane("team_leader", "Product Design Manager")).toBe(true);
    expect(candidateFitsSearchLane("team_leader", "Account Executive")).toBe(false);
    expect(candidateFitsSearchLane("recruiter", "Talent Acquisition Partner, Product & Engineering")).toBe(true);
    expect(candidateFitsSearchLane("recruiter", "Head of Product Design")).toBe(false);
  });
});
