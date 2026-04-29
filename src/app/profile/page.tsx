import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell } from "@/components/ui";
import { getUserProfile } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const profile = getUserProfile();

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
      </div>
    </Shell>
  );
}
