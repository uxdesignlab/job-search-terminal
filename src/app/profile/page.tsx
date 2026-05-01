import { revalidatePath } from "next/cache";
import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Select, SubmitButton, Textarea } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { ExtractProfileButton } from "@/components/extract-profile-button";
import { ResumeManageCard } from "@/components/resume-manage-card";
import { getResumes, getSkills, getUserProfile, getWritingStyle, saveWritingStyle, updateUserProfile } from "@/lib/db/queries";
import { splitListValue } from "@/lib/profile/intelligence";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const profile = getUserProfile();
  const skills = getSkills();
  const resumes = getResumes();
  const writingStyle = getWritingStyle();

  async function updateProfileAction(formData: FormData) {
    "use server";

    updateUserProfile({
      currentSearchGoal: String(formData.get("currentSearchGoal") ?? ""),
      urgency: String(formData.get("urgency") ?? ""),
      direction: String(formData.get("direction") ?? ""),
      targetRoles: splitListValue(formData.get("targetRoles")),
      desiredIndustries: splitListValue(formData.get("desiredIndustries")),
      compensationNeeds: String(formData.get("compensationNeeds") ?? ""),
      workPreferences: splitListValue(formData.get("workPreferences")),
      constraints: splitListValue(formData.get("constraints")),
      dealBreakers: splitListValue(formData.get("dealBreakers")),
      careerIntent: String(formData.get("careerIntent") ?? ""),
      careerChangeInterest: String(formData.get("careerChangeInterest") ?? ""),
      confidenceLevel: String(formData.get("confidenceLevel") ?? ""),
      skillsToUseMore: splitListValue(formData.get("skillsToUseMore")),
      skillsToUseLess: splitListValue(formData.get("skillsToUseLess")),
      preferredLocations: splitListValue(formData.get("preferredLocations")),
      remotePreference: (String(formData.get("remotePreference") ?? "all")) as "remote-only" | "local-or-remote" | "all"
    });

    revalidatePath("/profile");
    revalidatePath("/strategy");
    revalidatePath("/dashboard");
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

  return (
    <Shell activeItem="Profile">
      <div className="grid gap-6">
        <PageHeader
          actions={<ExtractProfileButton />}
          description="Career profile details that organize Pavel's goals, constraints, strengths, and resume strategy."
          eyebrow="User strategy"
          title="Profile"
        />

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>{profile.name}</CardTitle>
              <CardDescription>{profile.currentSearchGoal}</CardDescription>
            </CardHeader>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-muted">Location</dt>
                <dd className="mt-1 text-sm text-ink">{profile.location}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted">Portfolio</dt>
                <dd className="mt-1 text-sm text-ink">{profile.portfolio}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted">Urgency</dt>
                <dd className="mt-1 text-sm text-ink">{profile.urgency}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted">Direction</dt>
                <dd className="mt-1 text-sm text-ink">{profile.direction}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Target roles</CardTitle>
              <CardDescription>Initial targets for role matching.</CardDescription>
            </CardHeader>
            <div className="flex flex-wrap gap-2">
              {profile.targetRoles.map((role) => (
                <Badge key={role}>{role}</Badge>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Strongest skills</CardTitle>
              <CardDescription>{profile.strongestSkills.join(", ")}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Use more</CardTitle>
              <CardDescription>{profile.skillsToUseMore.join(", ")}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Use less</CardTitle>
              <CardDescription>{profile.skillsToUseLess.join(", ")}</CardDescription>
            </CardHeader>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Constraints</CardTitle>
            <CardDescription>Constraints that guide fit scoring and recommendations.</CardDescription>
          </CardHeader>
          <ul className="grid gap-2 sm:grid-cols-2">
            {profile.constraints.map((constraint) => (
              <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={constraint}>
                {constraint}
              </li>
            ))}
          </ul>
        </Card>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Resume lanes</CardTitle>
              <CardDescription>Rename or re-upload any resume. Changes take effect on the next generation.</CardDescription>
            </CardHeader>
            <div className="grid gap-3">
              {resumes.map((resume) => (
                <ResumeManageCard
                  key={resume.id}
                  id={resume.id}
                  name={resume.name}
                  wordCount={resume.wordCount}
                  evidence={resume.evidence}
                />
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skill inventory</CardTitle>
              <CardDescription>Skills are tied to resume-lane evidence and can be refined in later phases.</CardDescription>
            </CardHeader>
            <div className="grid gap-2">
              {skills.map((skill) => (
                <div className="rounded-control border border-border bg-surface px-3 py-2" key={skill.id}>
                  <p className="text-sm font-medium text-ink">{skill.skillName}</p>
                  <p className="text-xs leading-5 text-muted">
                    {skill.skillCategory} · {skill.evidenceSource}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* ── Writing style ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Writing voice</CardTitle>
            <CardDescription>
              {writingStyle.toneProfile
                ? `Style extracted from ${writingStyle.sampleCount} sample${writingStyle.sampleCount !== 1 ? "s" : ""} — applied to all AI-generated content`
                : "Paste writing samples so AI-generated content matches your authentic voice"}
            </CardDescription>
          </CardHeader>

          {writingStyle.toneProfile && (() => {
            try {
              const p = JSON.parse(writingStyle.toneProfile) as { tone?: string; formality?: string; sentenceStyle?: string; styleGuide?: string };
              return (
                <div className="mb-4 grid gap-2 rounded-control border border-border bg-surface p-3">
                  {p.tone && <p className="text-sm text-ink"><span className="font-medium">Tone:</span> {p.tone}</p>}
                  {p.formality && <p className="text-sm text-ink"><span className="font-medium">Formality:</span> {p.formality}</p>}
                  {p.sentenceStyle && <p className="text-sm text-ink"><span className="font-medium">Sentence style:</span> {p.sentenceStyle}</p>}
                  {p.styleGuide && <p className="text-sm text-muted italic">{p.styleGuide}</p>}
                </div>
              );
            } catch { return null; }
          })()}

          <form action={extractWritingStyleAction} className="grid gap-3">
            <Textarea
              defaultValue=""
              hint="Paste 2–5 writing samples (emails, cover letters, LinkedIn posts). Separate samples with a line containing just: ---"
              label="Writing samples"
              name="writingSamples"
              rows={8}
            />
            <SubmitButton label={writingStyle.toneProfile ? "Re-extract style" : "Extract writing style"} pendingLabel="Analyzing…" savedLabel="Style saved ✓" />
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edit profile strategy</CardTitle>
            <CardDescription>Updates are saved locally and recorded in the activity log.</CardDescription>
          </CardHeader>
          <form action={updateProfileAction} className="grid gap-4">
            <Textarea defaultValue={profile.currentSearchGoal} label="Current search goal" name="currentSearchGoal" />
            <Textarea defaultValue={profile.direction} label="Search direction" name="direction" />
            <Textarea defaultValue={profile.targetRoles.join("\n")} hint="One role per line." label="Target roles" name="targetRoles" />
            <Textarea defaultValue={profile.desiredIndustries.join("\n")} label="Desired industries" name="desiredIndustries" />
            <Textarea defaultValue={profile.workPreferences.join("\n")} label="Work preferences" name="workPreferences" />
            <Textarea defaultValue={profile.constraints.join("\n")} label="Constraints" name="constraints" />
            <Textarea defaultValue={profile.dealBreakers.join("\n")} label="Deal breakers" name="dealBreakers" />
            <Textarea defaultValue={profile.careerIntent} label="Career intent" name="careerIntent" />
            <Textarea defaultValue={profile.careerChangeInterest} label="Career-change interest" name="careerChangeInterest" />
            <Textarea defaultValue={profile.compensationNeeds} label="Compensation needs" name="compensationNeeds" />
            <Textarea defaultValue={profile.confidenceLevel} label="Confidence level" name="confidenceLevel" />
            <Textarea defaultValue={profile.skillsToUseMore.join("\n")} label="Skills to use more" name="skillsToUseMore" />
            <Textarea defaultValue={profile.skillsToUseLess.join("\n")} label="Skills to use less" name="skillsToUseLess" />
            <Textarea defaultValue={profile.urgency} label="Urgency" name="urgency" />
            <Textarea
              defaultValue={profile.preferredLocations.join("\n")}
              hint="One city or metro per line. Example: City, State"
              label="Preferred locations"
              name="preferredLocations"
            />
            <Select defaultValue={profile.remotePreference} label="Remote preference" name="remotePreference">
              <option value="remote-only">Remote only — hide on-site and hybrid jobs</option>
              <option value="local-or-remote">My area or remote — hide other cities</option>
              <option value="all">All locations — show everything</option>
            </Select>
            <div>
              <SubmitButton label="Save profile" savedLabel="Profile saved" />
            </div>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
