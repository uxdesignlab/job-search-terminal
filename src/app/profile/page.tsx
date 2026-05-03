import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Select, SubmitButton, Textarea } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { ExtractProfileButton } from "@/components/extract-profile-button";
import { ResumeManageCard } from "@/components/resume-manage-card";
import { getResumes, getSkills, getUserProfile, getWritingStyle, saveWritingStyle, updateUserProfile } from "@/lib/db/queries";
import { splitListValue } from "@/lib/profile/intelligence";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview",     label: "Overview" },
  { id: "resumes",      label: "Resumes" },
  { id: "skills",       label: "Skills & Roles" },
  { id: "preferences",  label: "Preferences" },
  { id: "constraints",  label: "Constraints" },
  { id: "voice",        label: "Writing Voice" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isValidTab(t: string): t is TabId {
  return TABS.some((tab) => tab.id === t);
}

// ─── Server actions (each reads current profile to preserve untouched fields) ──

async function updateOverviewAction(formData: FormData) {
  "use server";
  const p = getUserProfile();
  updateUserProfile({
    currentSearchGoal: String(formData.get("currentSearchGoal") ?? ""),
    urgency:           String(formData.get("urgency") ?? ""),
    direction:         String(formData.get("direction") ?? ""),
    careerIntent:      String(formData.get("careerIntent") ?? ""),
    careerChangeInterest: String(formData.get("careerChangeInterest") ?? ""),
    confidenceLevel:   String(formData.get("confidenceLevel") ?? ""),
    // Preserve other tabs' fields untouched
    targetRoles:        p.targetRoles,
    desiredIndustries:  p.desiredIndustries,
    compensationNeeds:  p.compensationNeeds,
    workPreferences:    p.workPreferences,
    constraints:        p.constraints,
    dealBreakers:       p.dealBreakers,
    skillsToUseMore:    p.skillsToUseMore,
    skillsToUseLess:    p.skillsToUseLess,
    preferredLocations: p.preferredLocations,
    remotePreference:   p.remotePreference,
  });
  revalidatePath("/profile");
  revalidatePath("/strategy");
  revalidatePath("/dashboard");
}

async function updateSkillsAction(formData: FormData) {
  "use server";
  const p = getUserProfile();
  updateUserProfile({
    targetRoles:     splitListValue(formData.get("targetRoles")),
    skillsToUseMore: splitListValue(formData.get("skillsToUseMore")),
    skillsToUseLess: splitListValue(formData.get("skillsToUseLess")),
    // Preserve other tabs' fields
    currentSearchGoal:    p.currentSearchGoal,
    urgency:              p.urgency,
    direction:            p.direction,
    careerIntent:         p.careerIntent,
    careerChangeInterest: p.careerChangeInterest,
    confidenceLevel:      p.confidenceLevel,
    desiredIndustries:    p.desiredIndustries,
    compensationNeeds:    p.compensationNeeds,
    workPreferences:      p.workPreferences,
    constraints:          p.constraints,
    dealBreakers:         p.dealBreakers,
    preferredLocations:   p.preferredLocations,
    remotePreference:     p.remotePreference,
  });
  revalidatePath("/profile");
  revalidatePath("/strategy");
}

async function updatePreferencesAction(formData: FormData) {
  "use server";
  const p = getUserProfile();
  updateUserProfile({
    desiredIndustries:  splitListValue(formData.get("desiredIndustries")),
    workPreferences:    splitListValue(formData.get("workPreferences")),
    compensationNeeds:  String(formData.get("compensationNeeds") ?? ""),
    preferredLocations: splitListValue(formData.get("preferredLocations")),
    remotePreference:   (String(formData.get("remotePreference") ?? "all")) as "remote-only" | "local-or-remote" | "all",
    // Preserve other tabs' fields
    currentSearchGoal:    p.currentSearchGoal,
    urgency:              p.urgency,
    direction:            p.direction,
    careerIntent:         p.careerIntent,
    careerChangeInterest: p.careerChangeInterest,
    confidenceLevel:      p.confidenceLevel,
    targetRoles:          p.targetRoles,
    constraints:          p.constraints,
    dealBreakers:         p.dealBreakers,
    skillsToUseMore:      p.skillsToUseMore,
    skillsToUseLess:      p.skillsToUseLess,
  });
  revalidatePath("/profile");
  revalidatePath("/strategy");
  revalidatePath("/dashboard");
}

async function updateConstraintsAction(formData: FormData) {
  "use server";
  const p = getUserProfile();
  updateUserProfile({
    constraints:          splitListValue(formData.get("constraints")),
    dealBreakers:         splitListValue(formData.get("dealBreakers")),
    careerChangeInterest: String(formData.get("careerChangeInterest") ?? ""),
    // Preserve other tabs' fields
    currentSearchGoal:  p.currentSearchGoal,
    urgency:            p.urgency,
    direction:          p.direction,
    careerIntent:       p.careerIntent,
    confidenceLevel:    p.confidenceLevel,
    targetRoles:        p.targetRoles,
    desiredIndustries:  p.desiredIndustries,
    compensationNeeds:  p.compensationNeeds,
    workPreferences:    p.workPreferences,
    skillsToUseMore:    p.skillsToUseMore,
    skillsToUseLess:    p.skillsToUseLess,
    preferredLocations: p.preferredLocations,
    remotePreference:   p.remotePreference,
  });
  revalidatePath("/profile");
  revalidatePath("/strategy");
}

async function extractWritingStyleAction(formData: FormData) {
  "use server";
  const samples = String(formData.get("writingSamples") ?? "").trim();
  if (!samples) return;
  const { extractWritingStyle } = await import("@/lib/profile/writing-style-extractor");
  const sampleList = samples.split(/\n---\n/).map((s) => s.trim()).filter(Boolean);
  const result = await extractWritingStyle(sampleList.length > 0 ? sampleList : [samples]);
  saveWritingStyle(JSON.stringify(result), sampleList.length || 1);
  revalidatePath("/profile");
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab = "overview" } = await searchParams;
  const tab: TabId = isValidTab(rawTab) ? rawTab : "overview";

  const profile      = getUserProfile();
  const skills       = getSkills();
  const resumes      = getResumes();
  const writingStyle = getWritingStyle();

  // Resume gate: at least one PDF must be uploaded and extracted before AI extraction works
  const hasExtractedResumes = resumes.some((r) => r.wordCount > 0);

  return (
    <Shell activeItem="Profile">
      <div className="grid gap-6">
        <PageHeader
          description="Career profile — your goals, constraints, skills, and resume strategy."
          eyebrow="Account"
          title="Profile"
        />

        {/* ── Tab navigation ─────────────────────────────────────────── */}
        <nav aria-label="Profile sections" className="-mb-2">
          <ul className="flex gap-0 border-b border-border">
            {TABS.map((t) => (
              <li key={t.id}>
                <Link
                  aria-current={tab === t.id ? "page" : undefined}
                  className={
                    tab === t.id
                      ? "relative inline-flex items-center px-4 py-3 text-sm font-medium text-accent after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent after:content-['']"
                      : "inline-flex items-center px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
                  }
                  href={`/profile?tab=${t.id}`}
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Overview tab ───────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="grid gap-6">

            {/* Summary card */}
            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>{profile.name}</CardTitle>
                  <CardDescription>{profile.currentSearchGoal || "No search goal set yet."}</CardDescription>
                </CardHeader>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-muted">Location</dt>
                    <dd className="mt-1 text-sm text-ink">{profile.location || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted">Portfolio</dt>
                    <dd className="mt-1 text-sm text-ink">{profile.portfolio || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted">Urgency</dt>
                    <dd className="mt-1 text-sm text-ink">{profile.urgency || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted">Direction</dt>
                    <dd className="mt-1 text-sm text-ink">{profile.direction || "—"}</dd>
                  </div>
                </dl>
              </Card>

              {/* AI extraction CTA */}
              <Card>
                <CardHeader>
                  <CardTitle>AI profile extraction</CardTitle>
                  <CardDescription>
                    Reads your uploaded resumes and populates skills, role directions, and experience automatically.
                  </CardDescription>
                </CardHeader>
                {!hasExtractedResumes ? (
                  <div className="rounded-control border border-warning/40 bg-warning/5 p-3">
                    <p className="text-sm font-medium text-warning">Resume required</p>
                    <p className="mt-1 text-sm text-muted">
                      Upload at least one resume PDF on the{" "}
                      <Link className="font-medium text-accent underline underline-offset-2 hover:text-ink" href="/profile?tab=resumes">
                        Resumes tab
                      </Link>{" "}
                      before running AI extraction. The AI reads your resume text to populate your profile.
                    </p>
                  </div>
                ) : (
                  <ExtractProfileButton />
                )}
              </Card>
            </section>

            {/* Edit form */}
            <Card>
              <CardHeader>
                <CardTitle>Edit overview</CardTitle>
                <CardDescription>Updates are saved locally and recorded in the activity log.</CardDescription>
              </CardHeader>
              <form action={updateOverviewAction} className="grid gap-4">
                <Textarea defaultValue={profile.currentSearchGoal} label="Current search goal" name="currentSearchGoal" />
                <Textarea defaultValue={profile.direction}         label="Search direction"    name="direction" />
                <Select defaultValue={profile.urgency} label="Urgency" name="urgency">
                  <option value="">— select —</option>
                  <option value="actively searching">Actively searching</option>
                  <option value="open to opportunities">Open to opportunities</option>
                  <option value="passively looking">Passively looking</option>
                  <option value="not searching">Not searching</option>
                </Select>
                <Textarea defaultValue={profile.careerIntent}         label="Career intent"          name="careerIntent"
                  hint="Are you staying on your current path or exploring a shift?" />
                <Textarea defaultValue={profile.careerChangeInterest} label="Career change interest"  name="careerChangeInterest"
                  hint="If exploring a shift, describe what direction interests you." />
                <Textarea defaultValue={profile.confidenceLevel}      label="Confidence level"        name="confidenceLevel"
                  hint="How confident do you feel about the search right now?" />
                <div>
                  <SubmitButton label="Save overview" savedLabel="Saved ✓" />
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* ── Resumes tab ────────────────────────────────────────────── */}
        {tab === "resumes" && (
          <div className="grid gap-6">

            {!hasExtractedResumes && (
              <div className="rounded-control border border-accent/30 bg-accent/5 p-4">
                <p className="text-sm font-semibold text-ink">Upload your resume to get started</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Click <strong>Re-upload PDF</strong> on any lane below to add your resume file. Once uploaded,
                  go to the <Link className="font-medium text-accent underline underline-offset-2 hover:text-ink" href="/profile?tab=overview">Overview tab</Link> and
                  run <strong>AI profile extraction</strong> — the AI will read your resume and populate your skills,
                  role directions, and experience automatically.
                </p>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Resume lanes</CardTitle>
                <CardDescription>
                  Each lane is a different resume version. Upload a PDF to extract text for AI evaluation and tailoring.
                  Rename lanes to match their focus.
                </CardDescription>
              </CardHeader>
              <div className="grid gap-3">
                {resumes.map((resume) => (
                  <ResumeManageCard
                    evidence={resume.evidence}
                    id={resume.id}
                    key={resume.id}
                    name={resume.name}
                    wordCount={resume.wordCount}
                  />
                ))}
              </div>
            </Card>

            {hasExtractedResumes && (
              <Card>
                <CardHeader>
                  <CardTitle>Skill inventory</CardTitle>
                  <CardDescription>
                    Skills extracted from your resume lanes. Re-run AI extraction from the Overview tab to refresh.
                  </CardDescription>
                </CardHeader>
                <div className="grid gap-2">
                  {skills.length === 0 ? (
                    <p className="text-sm text-muted">No skills extracted yet.</p>
                  ) : (
                    skills.map((skill) => (
                      <div className="rounded-control border border-border bg-surface px-3 py-2" key={skill.id}>
                        <p className="text-sm font-medium text-ink">{skill.skillName}</p>
                        <p className="text-xs leading-5 text-muted">
                          {skill.skillCategory} · {skill.evidenceSource}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── Skills & Roles tab ─────────────────────────────────────── */}
        {tab === "skills" && (
          <div className="grid gap-6">

            {/* Current values display */}
            <section className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Strongest skills</CardTitle>
                  <CardDescription>Set by AI extraction from your resumes.</CardDescription>
                </CardHeader>
                <div className="flex flex-wrap gap-2">
                  {profile.strongestSkills.length > 0
                    ? profile.strongestSkills.map((s) => <Badge key={s}>{s}</Badge>)
                    : <p className="text-sm text-muted">Run AI extraction to populate.</p>
                  }
                </div>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Use more</CardTitle>
                  <CardDescription>Skills you want to lean into.</CardDescription>
                </CardHeader>
                <div className="flex flex-wrap gap-2">
                  {profile.skillsToUseMore.length > 0
                    ? profile.skillsToUseMore.map((s) => <Badge key={s}>{s}</Badge>)
                    : <p className="text-sm text-muted">None set yet.</p>
                  }
                </div>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Use less</CardTitle>
                  <CardDescription>Skills you want to move away from.</CardDescription>
                </CardHeader>
                <div className="flex flex-wrap gap-2">
                  {profile.skillsToUseLess.length > 0
                    ? profile.skillsToUseLess.map((s) => <Badge key={s}>{s}</Badge>)
                    : <p className="text-sm text-muted">None set yet.</p>
                  }
                </div>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Target roles</CardTitle>
                <CardDescription>Role titles used for fit scoring and job matching.</CardDescription>
              </CardHeader>
              <div className="mb-4 flex flex-wrap gap-2">
                {profile.targetRoles.length > 0
                  ? profile.targetRoles.map((role) => <Badge key={role}>{role}</Badge>)
                  : <p className="text-sm text-muted">No target roles set yet.</p>
                }
              </div>
            </Card>

            {/* Edit form */}
            <Card>
              <CardHeader>
                <CardTitle>Edit skills &amp; roles</CardTitle>
                <CardDescription>One item per line. Updates are saved locally.</CardDescription>
              </CardHeader>
              <form action={updateSkillsAction} className="grid gap-4">
                <Textarea
                  defaultValue={profile.targetRoles.join("\n")}
                  hint="One role title per line. Example: Principal Product Designer"
                  label="Target roles"
                  name="targetRoles"
                />
                <Textarea
                  defaultValue={profile.skillsToUseMore.join("\n")}
                  hint="Skills you want to apply more of in your next role."
                  label="Skills to use more"
                  name="skillsToUseMore"
                />
                <Textarea
                  defaultValue={profile.skillsToUseLess.join("\n")}
                  hint="Skills you want to step back from."
                  label="Skills to use less"
                  name="skillsToUseLess"
                />
                <div>
                  <SubmitButton label="Save skills & roles" savedLabel="Saved ✓" />
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* ── Preferences tab ────────────────────────────────────────── */}
        {tab === "preferences" && (
          <div className="grid gap-6">

            {/* Current values display */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle>Remote preference</CardTitle>
                </CardHeader>
                <p className="text-sm text-ink capitalize">{profile.remotePreference.replace(/-/g, " ") || "—"}</p>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Compensation</CardTitle>
                </CardHeader>
                <p className="text-sm text-ink">{profile.compensationNeeds || "—"}</p>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Industries</CardTitle>
                </CardHeader>
                <div className="flex flex-wrap gap-1.5">
                  {profile.desiredIndustries.length > 0
                    ? profile.desiredIndustries.map((i) => <Badge key={i}>{i}</Badge>)
                    : <p className="text-sm text-muted">None set.</p>
                  }
                </div>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Locations</CardTitle>
                </CardHeader>
                <div className="flex flex-wrap gap-1.5">
                  {profile.preferredLocations.length > 0
                    ? profile.preferredLocations.map((l) => <Badge key={l}>{l}</Badge>)
                    : <p className="text-sm text-muted">None set.</p>
                  }
                </div>
              </Card>
            </section>

            {/* Edit form */}
            <Card>
              <CardHeader>
                <CardTitle>Edit preferences</CardTitle>
                <CardDescription>Job search preferences used for filtering and fit scoring.</CardDescription>
              </CardHeader>
              <form action={updatePreferencesAction} className="grid gap-4">
                <Select defaultValue={profile.remotePreference} label="Remote preference" name="remotePreference">
                  <option value="remote-only">Remote only — hide on-site and hybrid jobs</option>
                  <option value="local-or-remote">My area or remote — hide other cities</option>
                  <option value="all">All locations — show everything</option>
                </Select>
                <Textarea
                  defaultValue={profile.preferredLocations.join("\n")}
                  hint="One city or metro per line. Example: City, State"
                  label="Preferred locations"
                  name="preferredLocations"
                />
                <Textarea
                  defaultValue={profile.desiredIndustries.join("\n")}
                  hint="One industry per line."
                  label="Desired industries"
                  name="desiredIndustries"
                />
                <Textarea
                  defaultValue={profile.compensationNeeds}
                  hint="Salary range, equity expectations, or other compensation notes."
                  label="Compensation needs"
                  name="compensationNeeds"
                />
                <Textarea
                  defaultValue={profile.workPreferences.join("\n")}
                  hint="One preference per line. Example: small team, async-first, mission-driven"
                  label="Work preferences"
                  name="workPreferences"
                />
                <div>
                  <SubmitButton label="Save preferences" savedLabel="Saved ✓" />
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* ── Constraints tab ────────────────────────────────────────── */}
        {tab === "constraints" && (
          <div className="grid gap-6">

            {/* Current values display */}
            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Constraints</CardTitle>
                  <CardDescription>Conditions that guide fit scoring and recommendations.</CardDescription>
                </CardHeader>
                <ul className="grid gap-2">
                  {profile.constraints.length > 0
                    ? profile.constraints.map((c) => (
                        <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={c}>{c}</li>
                      ))
                    : <li className="text-sm text-muted">No constraints set.</li>
                  }
                </ul>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Deal breakers</CardTitle>
                  <CardDescription>Hard no conditions — automatically flagged during evaluation.</CardDescription>
                </CardHeader>
                <ul className="grid gap-2">
                  {profile.dealBreakers.length > 0
                    ? profile.dealBreakers.map((d) => (
                        <li className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-ink" key={d}>{d}</li>
                      ))
                    : <li className="text-sm text-muted">No deal breakers set.</li>
                  }
                </ul>
              </Card>
            </section>

            {/* Edit form */}
            <Card>
              <CardHeader>
                <CardTitle>Edit constraints</CardTitle>
                <CardDescription>One item per line. These are used during every job evaluation.</CardDescription>
              </CardHeader>
              <form action={updateConstraintsAction} className="grid gap-4">
                <Textarea
                  defaultValue={profile.constraints.join("\n")}
                  hint="Soft limits — things to weigh but not hard blocks. One per line."
                  label="Constraints"
                  name="constraints"
                />
                <Textarea
                  defaultValue={profile.dealBreakers.join("\n")}
                  hint="Hard no conditions. The AI will flag these as red flags in evaluations. One per line."
                  label="Deal breakers"
                  name="dealBreakers"
                />
                <Textarea
                  defaultValue={profile.careerChangeInterest}
                  hint="Describe any career pivot interest. Leave blank if staying on the same path."
                  label="Career change interest"
                  name="careerChangeInterest"
                />
                <div>
                  <SubmitButton label="Save constraints" savedLabel="Saved ✓" />
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* ── Writing Voice tab ──────────────────────────────────────── */}
        {tab === "voice" && (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Writing voice</CardTitle>
                <CardDescription>
                  {writingStyle.toneProfile
                    ? `Style extracted from ${writingStyle.sampleCount} sample${writingStyle.sampleCount !== 1 ? "s" : ""} — applied to all AI-generated content`
                    : "Paste your own writing samples so AI-generated content matches your authentic voice."}
                </CardDescription>
              </CardHeader>

              {writingStyle.toneProfile && (() => {
                try {
                  const p = JSON.parse(writingStyle.toneProfile) as {
                    tone?: string;
                    formality?: string;
                    sentenceStyle?: string;
                    styleGuide?: string;
                  };
                  return (
                    <div className="mb-4 grid gap-2 rounded-control border border-border bg-surface p-3">
                      {p.tone          && <p className="text-sm text-ink"><span className="font-medium">Tone:</span> {p.tone}</p>}
                      {p.formality     && <p className="text-sm text-ink"><span className="font-medium">Formality:</span> {p.formality}</p>}
                      {p.sentenceStyle && <p className="text-sm text-ink"><span className="font-medium">Sentence style:</span> {p.sentenceStyle}</p>}
                      {p.styleGuide    && <p className="text-sm text-muted italic">{p.styleGuide}</p>}
                    </div>
                  );
                } catch { return null; }
              })()}

              <form action={extractWritingStyleAction} className="grid gap-3">
                <Textarea
                  defaultValue=""
                  hint="Paste 2–5 writing samples — emails, cover letters, LinkedIn posts. Separate samples with a line containing just: ---"
                  label="Writing samples"
                  name="writingSamples"
                  rows={8}
                />
                <SubmitButton
                  label={writingStyle.toneProfile ? "Re-extract style" : "Extract writing style"}
                  pendingLabel="Analyzing…"
                  savedLabel="Style saved ✓"
                />
              </form>
            </Card>
          </div>
        )}
      </div>
    </Shell>
  );
}
