import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-interview-prep-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  client.getDatabase();
  return { client, queries };
}

beforeEach(() => {
  delete process.env.JST_DATABASE_PATH;
});

afterEach(async () => {
  const client = await import("@/lib/db/client").catch(() => null);
  client?.closeDatabase();
  delete process.env.JST_DATABASE_PATH;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("interview prep database helpers", () => {
  it("seeds the default reusable interview questions", async () => {
    const { queries } = await loadFreshDb();

    const questions = queries.getInterviewQuestions();

    expect(questions.length).toBeGreaterThanOrEqual(10);
    expect(questions.some((q) => q.prompt === "Tell me about a time you led a cross-functional initiative.")).toBe(true);
    expect(questions.every((q) => q.active)).toBe(true);
  });

  it("saves, edits, and hides custom interview questions", async () => {
    const { queries } = await loadFreshDb();

    queries.saveInterviewQuestion({
      id: "custom-question",
      prompt: "Tell me about a design system tradeoff.",
      category: "Design systems",
      source: "custom",
    });
    queries.saveInterviewQuestion({
      id: "custom-question",
      prompt: "Tell me about a design-system tradeoff you had to defend.",
      category: "Design leadership",
      source: "custom",
    });
    queries.setInterviewQuestionActive("custom-question", false);

    expect(queries.getInterviewQuestions().some((q) => q.id === "custom-question")).toBe(false);
    const hidden = queries.getInterviewQuestions(true).find((q) => q.id === "custom-question");
    expect(hidden?.prompt).toBe("Tell me about a design-system tradeoff you had to defend.");
    expect(hidden?.active).toBe(false);
  });

  it("upserts story edits without duplicating rows or replacing created_at", async () => {
    const { client, queries } = await loadFreshDb();

    const baseStory = {
      id: "story-1",
      title: "Led onboarding repair",
      situation: "The onboarding flow was leaking users.",
      task: "I owned the redesign.",
      action: "I mapped drop-off data and aligned product and engineering.",
      result: "Activation improved by 20%.",
      reflection: "I learned to pair data with support-team context.",
      skills: ["product strategy"],
      themes: ["cross-functional"],
      storyKind: "standalone_story" as const,
      qualityStatus: "ready" as const,
      qualityNotes: "",
    };

    queries.saveStory(baseStory);
    const createdAt = queries.getStories().find((story) => story.id === "story-1")?.createdAt;
    queries.saveStory({ ...baseStory, title: "Repaired onboarding activation", result: "Activation improved by 24%." });

    const rows = client.getDatabase().prepare("select count(*) as count from story_bank where id = ?").get("story-1") as { count: number };
    const story = queries.getStories().find((item) => item.id === "story-1");

    expect(rows.count).toBe(1);
    expect(story?.createdAt).toBe(createdAt);
    expect(story?.title).toBe("Repaired onboarding activation");
    expect(story?.result).toBe("Activation improved by 24%.");
    expect(story?.tags).toEqual(["product strategy", "cross-functional"]);
  });

  it("classifies saved stories with kind and quality metadata", async () => {
    const { queries } = await loadFreshDb();

    queries.saveStory({
      id: "eval-story",
      title: "How do you handle ambiguity?",
      situation: "A team had unclear requirements.",
      task: "I had to create a decision path.",
      action: "I ran discovery and shaped options.",
      result: "",
      reflection: "I now clarify decision owners earlier.",
      skills: [],
      themes: [],
      sourceJobId: null,
      sourceBlockF: "evaluation",
      qualityStatus: "missing_result",
      qualityNotes: "Add a result.",
    });

    const story = queries.getStories().find((item) => item.id === "eval-story");

    expect(story?.storyKind).toBe("evaluation_suggestion");
    expect(story?.qualityStatus).toBe("missing_result");
    expect(story?.qualityNotes).toBe("Add a result.");
  });

  it("assigns a story to multiple eligible application positions", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    const insertJob = db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        @id, @company, @title, @url, 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', 'Found', 80,
        '', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    );
    insertJob.run({ id: "job-a", company: "Acme", title: "Design Lead", url: "https://example.com/a" });
    insertJob.run({ id: "job-b", company: "Beta", title: "Principal Designer", url: "https://example.com/b" });
    db.prepare("insert into applications (id, job_id, status, follow_up_date, notes, contact, response_status, company, role, fit_score) values (?, ?, ?, '', '', '', '', ?, ?, 0)")
      .run("app-a", "job-a", "Applied", "Acme", "Design Lead");
    db.prepare("insert into applications (id, job_id, status, follow_up_date, notes, contact, response_status, company, role, fit_score) values (?, ?, ?, '', '', '', '', ?, ?, 0)")
      .run("app-b", "job-b", "Interviewing", "Beta", "Principal Designer");

    expect(queries.getInterviewAssignmentJobs().map((job) => job.jobId).sort()).toEqual(["job-a", "job-b"]);

    queries.saveStory({
      id: "assigned-story",
      title: "Reusable leadership answer",
      situation: "A launch needed alignment.",
      task: "I owned the design strategy.",
      action: "I created decision options and facilitated reviews.",
      result: "The team shipped on time.",
      reflection: "I would set decision owners earlier.",
      skills: [],
      themes: [],
      tags: ["leadership", "stakeholder alignment", "delivery"],
      assignedJobIds: ["job-a", "job-b"],
    });

    const story = queries.getStories().find((item) => item.id === "assigned-story");

    expect(story?.tags).toEqual(["leadership", "stakeholder alignment", "delivery"]);
    expect(story?.assignedJobs.map((job) => job.jobId).sort()).toEqual(["job-a", "job-b"]);
  });

  it("auto-matches a story to an eligible position by tag overlap, without explicit assignment", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    const insertJob = db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        @id, @company, @title, @url, 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', @status, 80,
        @roleArchetype, '', @summary, '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    );
    insertJob.run({
      id: "job-principal",
      company: "Acme",
      title: "Principal Product Designer",
      url: "https://example.com/principal",
      status: "Applied",
      roleArchetype: "Design leadership",
      summary: "Owns design systems and mentors senior ICs."
    });
    db.prepare(
      "insert into applications (id, job_id, status, follow_up_date, notes, contact, response_status, company, role, fit_score) values (?, ?, ?, '', '', '', '', ?, ?, 0)"
    ).run("app-principal", "job-principal", "Applied", "Acme", "Principal Product Designer");

    queries.saveStory({
      id: "leadership-story",
      title: "Led a design systems overhaul",
      situation: "Our design system had drifted from the product.",
      task: "I owned bringing it back in line with leadership backing.",
      action: "I audited components and rebuilt governance.",
      result: "Adoption reached 90% within a quarter.",
      reflection: "I'd involve engineering earlier next time.",
      skills: [],
      themes: [],
      tags: ["design leadership", "design systems"]
    });

    const story = queries.getStories().find((item) => item.id === "leadership-story");

    expect(story?.assignedJobs).toEqual([
      expect.objectContaining({ jobId: "job-principal", source: "auto" })
    ]);

    // Regression: removing an auto-matched position must not have it immediately
    // re-added by the auto-matcher running as part of the same save.
    queries.saveStory(
      {
        id: "leadership-story",
        title: "Led a design systems overhaul",
        situation: "Our design system had drifted from the product.",
        task: "I owned bringing it back in line with leadership backing.",
        action: "I audited components and rebuilt governance.",
        result: "Adoption reached 90% within a quarter.",
        reflection: "I'd involve engineering earlier next time.",
        skills: [],
        themes: [],
        tags: ["design leadership", "design systems"],
        assignedJobIds: []
      },
      { skipAutoMatch: true }
    );

    const afterRemoval = queries.getStories().find((item) => item.id === "leadership-story");
    expect(afterRemoval?.assignedJobs).toEqual([]);
  });

  it("does not auto-match a story to a position the user has not applied to", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    const insertJob = db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        @id, @company, @title, @url, 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', @status, 80,
        @roleArchetype, '', @summary, '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    );
    // Found but never applied to, reviewed, or generated a resume for — not eligible.
    insertJob.run({
      id: "job-found-only",
      company: "Globex",
      title: "Principal Product Designer",
      url: "https://example.com/found-only",
      status: "Found",
      roleArchetype: "Design leadership",
      summary: "Owns design systems and mentors senior ICs."
    });

    queries.saveStory({
      id: "unmatched-story",
      title: "Led a design systems overhaul",
      situation: "Our design system had drifted from the product.",
      task: "I owned bringing it back in line with leadership backing.",
      action: "I audited components and rebuilt governance.",
      result: "Adoption reached 90% within a quarter.",
      reflection: "I'd involve engineering earlier next time.",
      skills: [],
      themes: [],
      tags: ["design leadership", "design systems"]
    });

    const story = queries.getStories().find((item) => item.id === "unmatched-story");
    expect(story?.assignedJobs).toEqual([]);
  });

  it("auto-matches existing stories once a job transitions into an eligible status", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    const insertJob = db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        @id, @company, @title, @url, 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', @status, 80,
        @roleArchetype, '', @summary, '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    );
    insertJob.run({
      id: "job-later-applied",
      company: "Initech",
      title: "Senior Developer",
      url: "https://example.com/later-applied",
      status: "Reviewed",
      roleArchetype: "Ambiguity and greenfield builds",
      summary: "Comfortable navigating ambiguity on greenfield systems."
    });

    queries.saveStory({
      id: "ambiguity-story",
      title: "Shipped through an ambiguous rewrite",
      situation: "Requirements were unclear at project kickoff.",
      task: "I had to define scope with incomplete data.",
      action: "I ran discovery, made tradeoffs explicit, and shipped incrementally.",
      result: "We launched on time with no scope disputes.",
      reflection: "I'd document assumptions earlier next time.",
      skills: [],
      themes: [],
      tags: ["ambiguity", "greenfield"]
    });

    expect(queries.getStories().find((item) => item.id === "ambiguity-story")?.assignedJobs).toEqual([]);

    queries.updateApplicationStatus({ jobId: "job-later-applied", status: "Applied" });

    const story = queries.getStories().find((item) => item.id === "ambiguity-story");
    expect(story?.assignedJobs).toEqual([
      expect.objectContaining({ jobId: "job-later-applied", source: "auto" })
    ]);
  });

  it("tags evaluation-suggestion stories with the source job's own ATS keywords, capped at 12", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        'job-kw', 'Acme', 'Senior Designer', 'https://example.com/kw', 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', 'Found', 80,
        '', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    ).run();

    const keywords = Array.from({ length: 15 }, (_, i) => `keyword-${i + 1}`);

    queries.autoSaveEvaluationStories(
      "job-kw",
      [
        {
          question: "Tell me about a time you led a redesign.",
          situation: "The product had inconsistent patterns.",
          task: "I owned unifying the design language.",
          action: "I audited components and drove adoption.",
          result: "Consistency scores improved across the product.",
          reflection: "I'd involve engineering earlier."
        }
      ],
      keywords
    );

    const story = queries.getStories().find((item) => item.sourceJobId === "job-kw");
    expect(story?.storyKind).toBe("evaluation_suggestion");
    expect(story?.tags).toEqual(keywords.slice(0, 12));
  });

  it("auto-matches a story to a job via the job's own evaluation keywords, not just title/archetype", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        'job-kwmatch', 'Beta', 'Product Manager', 'https://example.com/kwmatch', 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', 'Applied', 80,
        'Individual Contributor', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    ).run();
    db.prepare(
      "insert into applications (id, job_id, status, follow_up_date, notes, contact, response_status, company, role, fit_score) values (?, ?, ?, '', '', '', '', ?, ?, 0)"
    ).run("app-kwmatch", "job-kwmatch", "Applied", "Beta", "Product Manager");
    db.prepare(
      `insert into evaluations (
        id, job_id, fit_score, score_label, role_archetype, summary, strengths_json, gaps_json,
        red_flags_json, recommendation, resume_base_recommendation, requirement_match_json,
        resume_evidence_json, keywords_json
      ) values (
        'evaluation-job-kwmatch', 'job-kwmatch', 80, 'Strong', 'Individual Contributor', '', '[]', '[]',
        '[]', '', '', '[]', '[]', ?
      )`
    ).run(JSON.stringify(["design systems governance"]));

    // Title/archetype alone ("Product Manager" / "Individual Contributor") share no
    // words with the tag — only the job's own evaluation keyword does.
    queries.saveStory({
      id: "kw-match-story",
      title: "Rebuilt design system governance",
      situation: "Design system decisions were undocumented.",
      task: "I owned setting up a governance model.",
      action: "I created a review process and contribution guide.",
      result: "Component drift dropped to near zero.",
      reflection: "I'd formalize this earlier next time.",
      skills: [],
      themes: [],
      tags: ["design systems governance"]
    });

    const story = queries.getStories().find((item) => item.id === "kw-match-story");
    expect(story?.assignedJobs).toEqual([
      expect.objectContaining({ jobId: "job-kwmatch", source: "auto" })
    ]);
  });

  it("starts fresh installs with an empty private keyword taxonomy", async () => {
    const { queries } = await loadFreshDb();

    expect(queries.getKeywordTaxonomy()).toEqual([]);
  });

  it("builds a multi-level taxonomy from private story tags", async () => {
    const { queries } = await loadFreshDb();

    queries.saveStory({
      id: "research-story",
      title: "Learned through contextual inquiry",
      situation: "The team did not understand a clinical workflow.",
      task: "I had to uncover what users actually did.",
      action: "I ran shadowing sessions and contextual inquiry.",
      result: "We removed two unnecessary workflow steps.",
      reflection: "I would recruit edge-case users earlier.",
      skills: [],
      themes: [],
      tags: ["shadowing", "contextual inquiry"]
    });

    const taxonomy = queries.getKeywordTaxonomy();
    const research = taxonomy.find((concept) => concept.label === "Research");
    const userResearch = research?.children.find((concept) => concept.label === "User research");
    const qualitative = userResearch?.children.find((concept) => concept.label === "Qualitative research");
    const contextualInquiry = qualitative?.children.find((concept) => concept.label === "Contextual inquiry");
    const story = queries.getStories().find((item) => item.id === "research-story");

    expect(contextualInquiry?.depth).toBe(4);
    expect(contextualInquiry?.aliases.map((alias) => alias.rawPhrase).sort()).toEqual(["contextual inquiry", "shadowing"]);
    expect(story?.conceptTags.map((tag) => tag.label)).toContain("Contextual inquiry");
    expect(story?.rawKeywords.sort()).toEqual(["contextual inquiry", "shadowing"]);
  });

  it("auto-matches stories and jobs by taxonomy concept overlap across different wording", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        'job-research', 'Acme', 'Product Designer', 'https://example.com/research', 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', 'Applied', 80,
        'Product design', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    ).run();
    db.prepare(
      "insert into applications (id, job_id, status, follow_up_date, notes, contact, response_status, company, role, fit_score) values (?, ?, ?, '', '', '', '', ?, ?, 0)"
    ).run("app-research", "job-research", "Applied", "Acme", "Product Designer");
    db.prepare(
      `insert into evaluations (
        id, job_id, fit_score, score_label, role_archetype, summary, strengths_json, gaps_json,
        red_flags_json, recommendation, resume_base_recommendation, requirement_match_json,
        resume_evidence_json, keywords_json
      ) values (
        'evaluation-job-research', 'job-research', 80, 'Strong', 'Product design', '', '[]', '[]',
        '[]', '', '', '[]', '[]', ?
      )`
    ).run(JSON.stringify(["user research"]));

    queries.saveStory({
      id: "interview-story",
      title: "Interviewed users before redesign",
      situation: "The team had conflicting assumptions.",
      task: "I had to understand user needs.",
      action: "I conducted user interviews and synthesized patterns.",
      result: "The redesign focused on the top three needs.",
      reflection: "I would add diary studies next time.",
      skills: [],
      themes: [],
      tags: ["user interviews"]
    });

    const story = queries.getStories().find((item) => item.id === "interview-story");
    expect(story?.assignedJobs).toEqual([
      expect.objectContaining({ jobId: "job-research", source: "auto" })
    ]);
  });

  it("mints job-evaluation keywords as candidates, hidden from the active taxonomy", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        'job-cand', 'Acme', 'Designer', 'https://example.com/cand', 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', 'Found', 80,
        '', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    ).run();
    db.prepare(
      `insert into evaluations (
        id, job_id, fit_score, score_label, role_archetype, summary, strengths_json, gaps_json,
        red_flags_json, recommendation, resume_base_recommendation, requirement_match_json,
        resume_evidence_json, keywords_json
      ) values (
        'evaluation-job-cand', 'job-cand', 80, 'Strong', '', '', '[]', '[]',
        '[]', '', '', '[]', '[]', ?
      )`
    ).run(JSON.stringify(["clinical trials"]));

    // Linking runs lazily on read.
    const activeTree = queries.getKeywordTaxonomy();
    const activeLabels = activeTree.flatMap((c) => [c, ...c.children]).map((c) => c.label);
    expect(activeLabels).not.toContain("Clinical Trials");

    const candidates = queries.getTaxonomyCandidates();
    expect(candidates.some((c) => c.label === "Clinical Trials")).toBe(true);
    expect(queries.getTaxonomyStatusCounts().candidate).toBeGreaterThan(0);

    // A story link is the strongest signal — it promotes the candidate to active.
    queries.saveStory({
      id: "promoting-story",
      title: "Ran a clinical trial rollout",
      situation: "A clinical program needed structured evidence.",
      task: "I owned the trial UX.",
      action: "I designed the intake and consent flows.",
      result: "Enrollment error rate dropped by half.",
      reflection: "I'd pilot with more sites next time.",
      skills: [],
      themes: [],
      tags: ["clinical trials"],
    });

    const promotedTree = queries.getKeywordTaxonomy();
    const promotedLabels = promotedTree.flatMap((c) => [c, ...c.children]).map((c) => c.label);
    expect(promotedLabels).toContain("Clinical Trials");
  });

  it("blocks credentials, job titles, and company names from becoming concepts", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        'job-block', 'Globex', 'Designer', 'https://example.com/block', 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', 'Found', 80,
        '', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    ).run();
    db.prepare(
      `insert into evaluations (
        id, job_id, fit_score, score_label, role_archetype, summary, strengths_json, gaps_json,
        red_flags_json, recommendation, resume_base_recommendation, requirement_match_json,
        resume_evidence_json, keywords_json
      ) values (
        'evaluation-job-block', 'job-block', 80, 'Strong', '', '', '[]', '[]',
        '[]', '', '', '[]', '[]', ?
      )`
    ).run(JSON.stringify(["Bachelor's Degree", "Senior Product Designer", "Globex", "design systems"]));

    queries.getKeywordTaxonomy();

    const allLabels = [
      ...queries.getKeywordTaxonomy({ includeArchived: true, includeCandidates: true }).flatMap((c) => [c, ...c.children, ...c.children.flatMap((x) => x.children)]).map((c) => c.label.toLowerCase()),
      ...queries.getTaxonomyCandidates().map((c) => c.label.toLowerCase()),
    ];
    expect(allLabels).not.toContain("bachelor's degree");
    expect(allLabels).not.toContain("senior product designer");
    expect(allLabels).not.toContain("globex");
    // A legitimate skill from the same evaluation still lands (as a candidate).
    expect(queries.getTaxonomyCandidates().some((c) => c.label === "Design Systems")).toBe(true);
  });

  it("archives unused candidates and never resurrects them on re-evaluation", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        'job-unused', 'Acme', 'Designer', 'https://example.com/unused', 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', 'Found', 80,
        '', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    ).run();
    db.prepare(
      `insert into evaluations (
        id, job_id, fit_score, score_label, role_archetype, summary, strengths_json, gaps_json,
        red_flags_json, recommendation, resume_base_recommendation, requirement_match_json,
        resume_evidence_json, keywords_json
      ) values (
        'evaluation-job-unused', 'job-unused', 80, 'Strong', '', '', '[]', '[]',
        '[]', '', '', '[]', '[]', ?
      )`
    ).run(JSON.stringify(["cardiology workflows"]));

    queries.getKeywordTaxonomy();
    const archived = queries.archiveUnusedTaxonomyConcepts();
    expect(archived).toBeGreaterThan(0);
    expect(queries.getTaxonomyCandidates().some((c) => c.label === "Cardiology Workflows")).toBe(false);

    // Re-linking the same job's keywords (as happens on the next evaluation) must not
    // resurrect the archived concept — the resurrection bug fix.
    db.prepare("delete from job_keyword_concepts where job_id = 'job-unused'").run();
    queries.getKeywordTaxonomy();
    const stillArchived = db
      .prepare("select status from keyword_concepts where label = 'Cardiology Workflows'")
      .get() as { status: string } | undefined;
    expect(stillArchived?.status).toBe("archived");
  });

  it("surfaces existing stories that match a job and links them on demand, without auto-inserting", async () => {
    const { client, queries } = await loadFreshDb();
    const db = client.getDatabase();

    db.prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        'job-match', 'Acme', 'Design Systems Lead', 'https://example.com/match', 'manual', 'Remote', 'remote', '2026-07-01',
        'fresh', '', '', 'Reviewed', 80,
        'Design leadership', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
      )`
    ).run();
    db.prepare(
      `insert into evaluations (
        id, job_id, fit_score, score_label, role_archetype, summary, strengths_json, gaps_json,
        red_flags_json, recommendation, resume_base_recommendation, requirement_match_json,
        resume_evidence_json, keywords_json
      ) values (
        'evaluation-job-match', 'job-match', 80, 'Strong', 'Design leadership', '', '[]', '[]',
        '[]', '', '', '[]', '[]', ?
      )`
    ).run(JSON.stringify(["design systems"]));

    queries.saveStory({
      id: "core-ds-story",
      title: "Rebuilt the design system",
      situation: "Components had drifted.",
      task: "I owned the rebuild.",
      action: "I set up governance and a contribution model.",
      result: "Adoption hit 90%.",
      reflection: "I'd involve engineering earlier.",
      skills: [],
      themes: [],
      tags: ["design systems"],
    });

    // The job is only 'Reviewed' (not an eligible application), so auto-match did not
    // link it — but it should surface as a suggested match.
    const matches = queries.getMatchingStoriesForJob("job-match");
    expect(matches.some((m) => m.id === "core-ds-story" && !m.alreadyLinked)).toBe(true);

    queries.setStoryJobLink("core-ds-story", "job-match", true);
    const afterLink = queries.getMatchingStoriesForJob("job-match");
    expect(afterLink.find((m) => m.id === "core-ds-story")?.alreadyLinked).toBe(true);

    queries.setStoryJobLink("core-ds-story", "job-match", false);
    const afterUnlink = queries.getMatchingStoriesForJob("job-match");
    expect(afterUnlink.find((m) => m.id === "core-ds-story")?.alreadyLinked).toBe(false);
  });

  it("lets users add, move, alias, archive, restore, and merge taxonomy tags", async () => {
    const { queries } = await loadFreshDb();

    const parentId = queries.saveTaxonomyConcept({ label: "Research" });
    expect(parentId).toBeTruthy();
    const childId = queries.saveTaxonomyConcept({ label: "Customer discovery", parentId });
    expect(childId).toBeTruthy();
    if (!parentId || !childId) throw new Error("Expected taxonomy concepts to be created.");
    queries.addTaxonomyAlias(childId, "discovery interviews");

    let taxonomy = queries.getKeywordTaxonomy({ includeArchived: true });
    let parent = taxonomy.find((concept) => concept.id === parentId);
    expect(parent?.children.find((concept) => concept.id === childId)?.aliases.map((alias) => alias.rawPhrase)).toContain("discovery interviews");

    queries.archiveTaxonomyConcept(childId);
    taxonomy = queries.getKeywordTaxonomy({ includeArchived: true });
    expect(taxonomy.flatMap((concept) => [concept, ...concept.children]).find((concept) => concept.id === childId)?.status).toBe("archived");

    queries.restoreTaxonomyConcept(childId);
    queries.mergeTaxonomyConcept(childId, parentId);
    taxonomy = queries.getKeywordTaxonomy({ includeArchived: true });
    parent = taxonomy.find((concept) => concept.id === parentId);
    expect(parent?.aliases.map((alias) => alias.rawPhrase)).toContain("discovery interviews");
  });
});
