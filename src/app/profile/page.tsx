import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Select, SubmitButton, Textarea } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { ExtractProfileButton } from "@/components/extract-profile-button";
import { PreferredLocationsInput } from "@/components/preferred-locations-input";
import { ResumeManageCard } from "@/components/resume-manage-card";
import { CreateResumeButton } from "@/components/create-resume-button";
import { createResumeLane, getResumes, getSkills, getUserProfile, getWritingStyle, saveWritingStyle, updateUserProfile } from "@/lib/db/queries";
import { ensureResumeBuilderVersion } from "@/lib/documents/resume-builder";
import { splitListValue } from "@/lib/profile/intelligence";
import { normalizePreferredLocations } from "@/lib/profile/locations";
import type { WorkMode } from "@/lib/db/types";

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

const WORK_MODE_VALUES = new Set<WorkMode>(["remote", "hybrid", "onsite"]);

function splitWorkModes(formData: FormData): WorkMode[] {
  return formData.getAll("workModes").filter((value): value is WorkMode => WORK_MODE_VALUES.has(value as WorkMode));
}

function remotePreferenceFromWorkModes(workModes: WorkMode[]): "remote-only" | "local-or-remote" | "all" {
  if (workModes.length === 1 && workModes[0] === "remote") return "remote-only";
  if (workModes.includes("remote") && workModes.length < 3) return "local-or-remote";
  return "all";
}

function workModeLabel(mode: WorkMode) {
  if (mode === "remote") return "Remote";
  if (mode === "hybrid") return "Hybrid";
  return "On-site";
}

function freeFormWorkPreferences(preferences: string[]) {
  return preferences.filter((preference) => {
    const normalized = preference.toLowerCase();
    return !normalized.includes("remote") &&
      !normalized.includes("hybrid") &&
      !normalized.includes("on-site") &&
      !normalized.includes("onsite");
  });
}

// ─── Server actions (each reads current profile to preserve untouched fields) ──

async function updateOverviewAction(formData: FormData) {
  "use server";
  const p = getUserProfile();
  updateUserProfile({
    name:                 p.name,
    location:             p.location,
    portfolio:            p.portfolio,
    strongestSkills:      p.strongestSkills,
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
    workModes:          p.workModes,
    hasExplicitWorkModes: p.hasExplicitWorkModes,
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
    name:            p.name,
    location:        p.location,
    portfolio:       p.portfolio,
    strongestSkills: p.strongestSkills,
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
    workModes:            p.workModes,
    hasExplicitWorkModes: p.hasExplicitWorkModes,
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
  const workModes = splitWorkModes(formData);
  updateUserProfile({
    name:               p.name,
    location:           p.location,
    portfolio:          p.portfolio,
    strongestSkills:    p.strongestSkills,
    desiredIndustries:  splitListValue(formData.get("desiredIndustries")),
    workPreferences:    splitListValue(formData.get("workPreferences")),
    workModes,
    hasExplicitWorkModes: workModes.length > 0,
    compensationNeeds:  String(formData.get("compensationNeeds") ?? ""),
    preferredLocations: normalizePreferredLocations(splitListValue(formData.get("preferredLocations"))),
    remotePreference:   remotePreferenceFromWorkModes(workModes),
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
  revalidatePath("/jobs");
}

async function updateConstraintsAction(formData: FormData) {
  "use server";
  const p = getUserProfile();
  updateUserProfile({
    name:                 p.name,
    location:             p.location,
    portfolio:            p.portfolio,
    strongestSkills:      p.strongestSkills,
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
    workModes:          p.workModes,
    hasExplicitWorkModes: p.hasExplicitWorkModes,
    skillsToUseMore:    p.skillsToUseMore,
    skillsToUseLess:    p.skillsToUseLess,
    preferredLocations: p.preferredLocations,
    remotePreference:   p.remotePreference,
  });
  revalidatePath("/profile");
  revalidatePath("/strategy");
  revalidatePath("/jobs");
}

async function addResumeLaneAction() {
  "use server";
  createResumeLane("New Resume");
  revalidatePath("/profile");
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
  const workPreferenceText = freeFormWorkPreferences(profile.workPreferences).join("\n");

  // Resume gate: at least one PDF must be uploaded and extracted before AI extraction works
  const hasExtractedResumes = resumes.some((r) => r.wordCount > 0);
  const visibleResumes = hasExtractedResumes
    ? resumes.filter((resume) => resume.wordCount > 0 || resume.sourceFile === "")
    : resumes.slice(0, 1);
  const builderVersions = new Map<string, { status: "needs_review" | "approved" | "missing_source" }>();
  for (const resume of visibleResumes) {
    if (resume.wordCount > 0 || resume.extractedText || resume.sourceFile) {
      const version = await ensureResumeBuilderVersion(resume, profile);
      if (version) builderVersions.set(resume.id, { status: version.status });
    }
  }

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
                    Upload a resume PDF, then run extraction — the AI reads your resume
                    and populates skills, target roles, and experience automatically.
                  </CardDescription>
                </CardHeader>

                {/* Step 1 — upload */}
                <div className={`mb-3 flex gap-3 rounded-control border p-3 ${
                  !hasExtractedResumes
                    ? "border-accent/40 bg-accent/5"
                    : "border-border bg-surface"
                }`}>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    hasExtractedResumes ? "bg-success text-white" : "bg-accent text-white"
                  }`}>
                    {hasExtractedResumes ? "✓" : "1"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">Upload a resume PDF</p>
                    {!hasExtractedResumes ? (
                      <p className="mt-0.5 text-sm text-muted">
                        Go to the{" "}
                        <Link
                          className="font-medium text-accent underline underline-offset-2 hover:text-ink"
                          href="/profile?tab=resumes"
                        >
                          Resumes tab
                        </Link>{" "}
                        and click <strong>Upload resume</strong>.
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-success">
                        {resumes.filter((r) => r.wordCount > 0).length}{" "}
                        resume{resumes.filter((r) => r.wordCount > 0).length !== 1 ? "s" : ""} ready
                      </p>
                    )}
                  </div>
                </div>

                {/* Step 2 — extract */}
                <div className={`flex gap-3 rounded-control border p-3 ${
                  hasExtractedResumes
                    ? "border-accent/40 bg-accent/5"
                    : "border-border bg-surface opacity-50"
                }`}>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    hasExtractedResumes ? "bg-accent text-white" : "bg-muted/30 text-muted"
                  }`}>
                    2
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">Extract with AI</p>
                    <p className="mt-0.5 mb-3 text-sm text-muted">
                      AI reads all uploaded resumes and populates your profile fields.
                      Review each tab after extraction.
                    </p>
                    <ExtractProfileButton disabled={!hasExtractedResumes} />
                  </div>
                </div>
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

            <Card>
              <CardHeader>
                <CardTitle>Resume lanes</CardTitle>
                <CardDescription>
                  Each lane is a different resume version. Upload a PDF to extract text for AI evaluation and tailoring.
                  Rename lanes to match their focus.
                </CardDescription>
              </CardHeader>
              <div className="grid gap-3">
                {visibleResumes.map((resume) => (
                  <ResumeManageCard
                    evidence={resume.evidence}
                    id={resume.id}
                    key={resume.id}
	                    name={resume.name}
	                    wordCount={resume.wordCount}
	                    builderStatus={builderVersions.get(resume.id)?.status}
	                  />
                ))}
              </div>

              {/* Add new lane */}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <form action={addResumeLaneAction}>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                    type="submit"
                  >
                    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Add resume (PDF)
                  </button>
                </form>
                <CreateResumeButton compact />
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
                  <CardTitle>Location mode</CardTitle>
                </CardHeader>
                <div className="flex flex-wrap gap-1.5">
                  {profile.workModes.length > 0
                    ? profile.workModes.map((mode) => <Badge key={mode}>{workModeLabel(mode)}</Badge>)
                    : <p className="text-sm text-muted">None set.</p>
                  }
                </div>
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
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-ink">Location mode</legend>
                  <div className="flex flex-wrap gap-3">
                    {(["remote", "hybrid", "onsite"] as WorkMode[]).map((mode) => (
                      <label
                        className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-panel px-3 text-sm text-ink"
                        key={mode}
                      >
                        <input
                          className="h-4 w-4 rounded border-border"
                          defaultChecked={profile.workModes.includes(mode)}
                          name="workModes"
                          type="checkbox"
                          value={mode}
                        />
                        {workModeLabel(mode)}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs leading-5 text-muted">
                    Select the work arrangements this search should include.
                  </p>
                </fieldset>
                <PreferredLocationsInput defaultLocations={profile.preferredLocations} />
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
                  defaultValue={workPreferenceText}
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
