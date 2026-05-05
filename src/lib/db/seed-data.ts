import { mockApplications, mockFunnel } from "@/data/mock/applications";
import { mockActivity } from "@/data/mock/dashboard";
import { mockGeneratedDocuments } from "@/data/mock/generated-documents";
import { mockJobs } from "@/data/mock/jobs";
import { mockProfile, mockRoleDirections } from "@/data/mock/profile";

export const seedUserProfile = {
  id: "pavel",
  ...mockProfile,
  desiredIndustries: ["AI products", "Enterprise SaaS", "Civic technology", "Healthcare platforms"],
  compensationNeeds: "Senior leadership range, to be validated per role",
  workPreferences: ["Remote first", "Selective hybrid", "Strategic product scope"],
  dealBreakers: ["Brand-only production", "Junior IC scope", "Onsite-only roles"],
  careerIntent: "Prioritize senior product design leadership with strong strategy, systems, and AI workflow relevance.",
  careerChangeInterest: "Open to adjacent AI product strategy, accessibility governance, and UX education roles when scope is strong.",
  confidenceLevel: "High for direct lanes; selective for adjacent teaching and AI strategy lanes."
};

export const seedSkills = mockProfile.strongestSkills.map((skill, index) => ({
  id: skill.toLowerCase().replaceAll(" ", "-"),
  userProfileId: seedUserProfile.id,
  skillName: skill,
  skillCategory: index < 3 ? "Core leadership" : "Specialized capability",
  evidenceSource: "Resume lane source",
  strengthLevel: "Strong",
  marketRelevance: "High",
  userInterestLevel: mockProfile.skillsToUseMore.includes(skill) ? "Use more" : "Maintain",
  usePreference: mockProfile.skillsToUseLess.includes(skill) ? "use_less" : "use_more"
}));

export const seedRoleDirections = mockRoleDirections.map((direction) => ({
  id: direction.family.toLowerCase().replaceAll(" ", "-").replaceAll("/", "and"),
  userProfileId: seedUserProfile.id,
  roleFamily: direction.family,
  fitLevel: direction.fit,
  score: direction.score,
  rationale: direction.rationale,
  gaps: direction.gaps,
  recommendationType: direction.fit.toLowerCase()
}));

export const seedResumes = [
  {
    id: "primary-resume",
    name: "Resume",
    sourceFile: "",
    status: "active",
    activeStatus: true
  }
];

export const seedJobs = mockJobs.map((job) => ({
  ...job,
  url: `https://example.com/jobs/${job.id}`,
  datePosted: null,
  firstSeenDate: "2026-04-29",
  rawDescription: job.summary,
  parsedDescription: job.summary
}));

export const seedEvaluations = mockJobs.map((job) => ({
  id: `evaluation-${job.id}`,
  jobId: job.id,
  fitScore: job.fitScore,
  scoreLabel: job.fitScore >= 85 ? "Strong fit" : job.fitScore >= 70 ? "Review" : "Weak fit",
  roleArchetype: job.roleArchetype,
  summary: job.summary,
  strengths: job.requirementMatch,
  gaps: job.gaps,
  redFlags: job.redFlags,
  recommendation: job.recommendation,
  resumeBaseRecommendation: job.recommendedResume,
  requirementMatch: job.requirementMatch,
  resumeEvidence: job.resumeEvidence
}));

export const seedApplications = mockApplications.map((application, index) => {
  const job = mockJobs.find((item) => item.company === application.company && item.title === application.role);

  return {
    id: `application-${index + 1}`,
    jobId: job?.id ?? `external-application-${index + 1}`,
    company: application.company,
    role: application.role,
    status: application.status,
    appliedDate: application.status === "Applied" || application.status === "Interviewing" ? "2026-04-29" : null,
    followUpDate: application.followUp,
    notes: "",
    contact: "",
    responseStatus: application.status,
    fitScore: application.fitScore
  };
});

export const seedGeneratedDocuments = mockGeneratedDocuments.map((document, index) => {
  const job = mockJobs.find((item) => item.company === document.company && item.title === document.role);

  return {
    id: `document-${index + 1}`,
    jobId: job?.id ?? `external-document-${index + 1}`,
    documentType: "resume",
    title: `${document.role} tailored resume`,
    content: "",
    pdfUrl: "",
    baseResume: document.baseResume,
    generatedDate: document.generatedDate,
    status: document.status,
    tailoringSummary: "Prepared from the selected resume lane."
  };
});

export const seedActivity = mockActivity.map((activity, index) => ({
  id: `activity-${index + 1}`,
  entityType: "job",
  entityId: seedJobs[index]?.id ?? "workspace",
  action: activity,
  timestamp: new Date(Date.UTC(2026, 3, 29, 12, index)).toISOString(),
  details: { source: "seed" }
}));

export const seedFunnel = mockFunnel;
