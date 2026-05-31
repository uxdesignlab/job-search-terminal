import assert from "node:assert/strict";
import { auditDraftAgainstEvidence, evidenceTextForDraft, revertUnsupportedMetrics } from "../src/lib/documents/evidence-audit";
import type { ResumeTemplateInput } from "../src/lib/documents/resume-template";

const source: ResumeTemplateInput = {
  name: "Test Candidate",
  headline: "Product Designer",
  contactItems: [],
  title: "Product Designer",
  summary: "Product designer focused on accessible workflows.",
  impactHeading: "Impact",
  impactItems: ["Reduced support tickets by 20% for onboarding workflows."],
  experienceHeading: "Experience",
  experience: [{
    title: "Product Designer",
    organization: "Example",
    dateRange: "2020 - 2024",
    bullets: ["Reduced support tickets by 20% for onboarding workflows."],
  }],
  skillsHeading: "Skills",
  skills: ["Accessibility"],
  recognitionHeading: "Recognition",
  recognition: [],
  extraSections: [],
  education: [],
};

const evidence = evidenceTextForDraft(source);
assert.equal(auditDraftAgainstEvidence(source, evidence).status, "supported");

const unsupported: ResumeTemplateInput = {
  ...source,
  experience: [{
    ...source.experience[0],
    bullets: ["Increased revenue by 20% through Kubernetes automation."],
  }],
};
const audit = auditDraftAgainstEvidence(unsupported, evidence);
assert.equal(audit.status, "unsupported-claims");
assert.equal(audit.issues.some((issue) => issue.claim === "20%"), true);
assert.equal(audit.issues.some((issue) => issue.claim === "kubernetes"), true);

const reverted = revertUnsupportedMetrics(source, unsupported, evidence);
assert.equal(reverted.draft.experience[0].bullets[0], source.experience[0].bullets[0]);
assert.equal(reverted.audit.status, "supported");

console.log("Evidence audit check passed: unrelated metrics and substantive unsupported claims are rejected and reverted.");
