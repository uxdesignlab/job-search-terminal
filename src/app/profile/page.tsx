import { revalidatePath } from "next/cache";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell, Textarea } from "@/components/ui";
import { getResumes, getSkills, getUserProfile, updateUserProfile } from "@/lib/db/queries";
import { splitListValue } from "@/lib/profile/intelligence";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const profile = getUserProfile();
  const skills = getSkills();
  const resumes = getResumes();

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
      skillsToUseLess: splitListValue(formData.get("skillsToUseLess"))
    });

    revalidatePath("/profile");
    revalidatePath("/strategy");
    revalidatePath("/dashboard");
  }

  return (
    <Shell activeItem="Profile">
      <div className="grid gap-6">
        <PageHeader
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
              <CardTitle>Resume evidence</CardTitle>
              <CardDescription>Extracted text is stored locally and used only as evidence for profile intelligence.</CardDescription>
            </CardHeader>
            <div className="grid gap-3">
              {resumes.map((resume) => (
                <div className="rounded-control border border-border bg-surface p-3" key={resume.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{resume.name}</p>
                    <Badge tone={resume.wordCount > 0 ? "success" : "warning"}>{resume.wordCount} words</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {resume.evidence.slice(0, 2).join(" ")}
                  </p>
                </div>
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
            <div>
              <Button type="submit">Save profile</Button>
            </div>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
