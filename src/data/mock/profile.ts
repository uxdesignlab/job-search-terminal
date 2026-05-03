export const mockProfile = {
  name: "Alex Jordan",
  location: "United States",
  portfolio: "",
  currentSearchGoal: "Find senior product design leadership roles with strong strategic scope.",
  urgency: "Active search",
  direction: "Prioritize principal design, head of design, design operations, and accessibility/design-system leadership roles.",
  constraints: ["Remote or selective hybrid", "Strategic product scope", "Avoid brand-only roles", "Avoid junior IC scope"],
  targetRoles: ["Principal Product Designer", "Head of Design", "Design Operations Lead", "Accessibility / Design Systems Director"],
  strongestSkills: ["Product strategy", "UX leadership", "Design systems", "Accessibility", "Design operations", "Teaching and mentoring"],
  skillsToUseMore: ["AI product strategy", "Executive storytelling", "Systems leadership"],
  skillsToUseLess: ["Brand-only production", "Low-level visual asset work"]
};

export const mockRoleDirections = [
  {
    family: "Principal Product Design",
    fit: "Direct",
    score: 92,
    rationale: "Best match for senior IC scope, product judgment, systems thinking, and leadership without requiring people management.",
    gaps: ["Confirm expected prototyping depth", "Show AI workflow examples clearly"]
  },
  {
    family: "Design Operations",
    fit: "Direct",
    score: 86,
    rationale: "Strong fit when the role owns rituals, governance, planning, and design-team effectiveness.",
    gaps: ["Clarify appetite for operations-heavy work"]
  },
  {
    family: "Accessibility / Design Systems",
    fit: "Adjacent",
    score: 88,
    rationale: "Strong evidence lane if the role includes product influence and governance, not only compliance execution.",
    gaps: ["Separate strategic accessibility leadership from tactical audit work"]
  },
  {
    family: "UX Education",
    fit: "Selective",
    score: 74,
    rationale: "Useful option for teaching-centered opportunities, but not always aligned with the primary career direction.",
    gaps: ["Confirm compensation and long-term growth path"]
  }
];
