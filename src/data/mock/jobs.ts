export type JobStatus =
  | "Found"
  | "Reviewed"
  | "Resume generated"
  | "Applied"
  | "Follow-up needed"
  | "Interviewing"
  | "Skipped";

export type JobRecommendation = "Priority apply" | "Strong apply" | "Review manually" | "Save for later" | "Skip";

export type MockJob = {
  id: string;
  company: string;
  title: string;
  location: string;
  remoteType: "Remote" | "Hybrid" | "Onsite";
  source: string;
  freshness: "New today" | "New this week" | "Recently found" | "Possibly stale";
  fitScore: number;
  roleArchetype: string;
  status: JobStatus;
  recommendation: JobRecommendation;
  summary: string;
  whyItMatches: string;
  mainConcern: string;
  recommendedResume: string;
  salaryNotes: string;
  requirementMatch: string[];
  resumeEvidence: string[];
  gaps: string[];
  redFlags: string[];
};

export const mockJobs: MockJob[] = [
  {
    id: "northstar-principal-product-designer",
    company: "Northstar AI",
    title: "Principal Product Designer, AI Workflows",
    location: "Remote, United States",
    remoteType: "Remote",
    source: "Hiring Cafe",
    freshness: "New today",
    fitScore: 92,
    roleArchetype: "Principal Product Design",
    status: "Reviewed",
    recommendation: "Priority apply",
    summary: "Senior IC role shaping AI-assisted workflow products for enterprise teams.",
    whyItMatches: "Strong overlap with product design leadership, AI workflow strategy, and systems thinking.",
    mainConcern: "Role may require deeper hands-on prototyping expectations than a leadership-heavy track.",
    recommendedResume: "Principal / Product Design Leadership",
    salaryNotes: "Compensation range not listed in the job description.",
    requirementMatch: ["Enterprise UX strategy", "AI workflow design", "Cross-functional leadership"],
    resumeEvidence: ["Principal design leadership", "Complex product systems", "Executive stakeholder alignment"],
    gaps: ["Confirm expected prototyping depth", "Clarify design team maturity"],
    redFlags: ["No salary transparency in listing"]
  },
  {
    id: "atlas-designops-lead",
    company: "Atlas Health",
    title: "Design Operations Lead",
    location: "Chicago, IL",
    remoteType: "Hybrid",
    source: "The Muse",
    freshness: "New this week",
    fitScore: 86,
    roleArchetype: "Design Operations",
    status: "Found",
    recommendation: "Strong apply",
    summary: "Operational design leadership role focused on standards, rituals, planning, and delivery quality.",
    whyItMatches: "Maps well to design operations, governance, and repeatable product practice experience.",
    mainConcern: "Hybrid cadence may need clarification against location preferences.",
    recommendedResume: "Design Operations",
    salaryNotes: "Listed range suggests senior design operations band.",
    requirementMatch: ["Design planning", "Design-system governance", "Stakeholder rituals"],
    resumeEvidence: ["DesignOps lane", "Process improvement", "Team enablement"],
    gaps: ["Clarify team size", "Clarify onsite cadence"],
    redFlags: ["Hybrid expectation may be rigid"]
  },
  {
    id: "civic-accessibility-systems",
    company: "Civic Platform",
    title: "Accessibility and Design Systems Director",
    location: "Remote, United States",
    remoteType: "Remote",
    source: "Remotive",
    freshness: "Recently found",
    fitScore: 88,
    roleArchetype: "Accessibility / Design Systems",
    status: "Resume generated",
    recommendation: "Priority apply",
    summary: "Leadership role combining accessibility governance with scalable design-system adoption.",
    whyItMatches: "Combines accessibility, systems, and organizational influence in a direct-fit lane.",
    mainConcern: "Could skew toward compliance ownership over product strategy.",
    recommendedResume: "Accessibility / Design Systems",
    salaryNotes: "Listing includes a broad senior leadership range.",
    requirementMatch: ["WCAG governance", "Design-system standards", "Cross-team adoption"],
    resumeEvidence: ["Accessibility resume lane", "Design systems work", "Governance experience"],
    gaps: ["Clarify legal/compliance ownership", "Clarify product design influence"],
    redFlags: ["Broad scope may imply under-resourced mandate"]
  },
  {
    id: "academy-ux-educator",
    company: "Product Academy",
    title: "Lead UX Design Instructor",
    location: "Remote, North America",
    remoteType: "Remote",
    source: "Working Nomads",
    freshness: "Possibly stale",
    fitScore: 74,
    roleArchetype: "UX Education",
    status: "Found",
    recommendation: "Save for later",
    summary: "Teaching role for advanced UX curriculum and career mentoring.",
    whyItMatches: "Relevant to the teaching lane and UX education experience.",
    mainConcern: "May not advance the primary leadership/product track.",
    recommendedResume: "Teaching / UX Education",
    salaryNotes: "Listing does not include compensation.",
    requirementMatch: ["UX instruction", "Mentoring", "Curriculum development"],
    resumeEvidence: ["Teaching resume lane", "UX practice depth", "Mentoring signals"],
    gaps: ["Confirm compensation", "Confirm full-time versus contract"],
    redFlags: ["Possibly stale listing"]
  },
  {
    id: "startup-brand-designer",
    company: "LaunchKit",
    title: "Senior Brand Designer",
    location: "New York, NY",
    remoteType: "Onsite",
    source: "Wellfound",
    freshness: "New this week",
    fitScore: 42,
    roleArchetype: "Avoid",
    status: "Skipped",
    recommendation: "Skip",
    summary: "Brand-heavy visual design role with limited product strategy scope.",
    whyItMatches: "Some design seniority overlap, but little fit with target role lanes.",
    mainConcern: "Wrong discipline focus and onsite requirement.",
    recommendedResume: "No resume recommended",
    salaryNotes: "Listing suggests mid-senior brand role band.",
    requirementMatch: ["Visual craft", "Brand systems"],
    resumeEvidence: ["General design background"],
    gaps: ["Brand portfolio focus", "Onsite availability"],
    redFlags: ["Not aligned to product/design leadership lanes", "Onsite only"]
  }
];

export function getJobById(id: string) {
  return mockJobs.find((job) => job.id === id);
}
