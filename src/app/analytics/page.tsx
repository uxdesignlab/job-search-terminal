import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { GlobalGapAddressingPanel } from "@/components/global-gap-addressing-panel";
import { getAllEvaluations, getApplications, getFunnelStages, getJobs, getProfileSupplements } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

function ScoreBar({ value, max = 100, tone = "accent" }: { value: number; max?: number; tone?: "accent" | "success" | "warning" }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  const colors = { accent: "bg-accent", success: "bg-success", warning: "bg-warning/70" };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-panel border border-border bg-panel px-5 py-4">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const jobs = getJobs();
  const evaluations = getAllEvaluations();
  const applications = getApplications();
  const funnelStages = getFunnelStages();
  const supplements = getProfileSupplements();

  const appliedApps = applications.filter((a) =>
    ["Applied", "Follow-up needed", "Recruiter responded", "Interviewing", "Offer"].includes(a.status)
  );
  const interviewApps = applications.filter((a) => ["Interviewing", "Offer"].includes(a.status));

  // Score-outcome correlation buckets
  const scoreBuckets = [
    { label: "80–100%", min: 80, max: 100, tone: "success" as const },
    { label: "60–79%", min: 60, max: 79, tone: "accent" as const },
    { label: "40–59%", min: 40, max: 59, tone: "warning" as const },
    { label: "0–39%", min: 0, max: 39, tone: "warning" as const },
  ];

  const scoreOutcome = scoreBuckets.map((bucket) => {
    const inBucket = applications.filter((a) => a.fitScore >= bucket.min && a.fitScore <= bucket.max);
    const applied = inBucket.filter((a) =>
      ["Applied", "Follow-up needed", "Recruiter responded", "Interviewing", "Offer"].includes(a.status)
    ).length;
    const rejected = inBucket.filter((a) => a.status === "Rejected").length;
    const interviewing = inBucket.filter((a) => ["Interviewing", "Offer"].includes(a.status)).length;
    return { ...bucket, total: inBucket.length, applied, rejected, interviewing };
  });

  // Archetype performance
  const archetypeMap = new Map<string, { count: number; applied: number; score: number }>();
  for (const ev of evaluations) {
    const archetype = ev.roleArchetype || "Other";
    const entry = archetypeMap.get(archetype) ?? { count: 0, applied: 0, score: 0 };
    entry.count++;
    entry.score += ev.fitScore;
    const app = applications.find((a) => a.jobId === ev.jobId);
    if (app && ["Applied", "Recruiter responded", "Interviewing", "Offer"].includes(app.status)) {
      entry.applied++;
    }
    archetypeMap.set(archetype, entry);
  }
  const archetypes = Array.from(archetypeMap.entries())
    .map(([name, d]) => ({ name, count: d.count, applied: d.applied, avgScore: Math.round(d.score / d.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Remote policy
  const remoteTypes = ["Remote", "Hybrid", "On-site", "Flexible"];
  const remoteConversion = remoteTypes
    .map((type) => {
      const matching = jobs.filter((j) => j.remoteType?.toLowerCase().includes(type.toLowerCase()));
      const applied = matching.filter((j) =>
        applications.some((a) => a.jobId === j.id && ["Applied", "Interviewing", "Offer"].includes(a.status))
      ).length;
      return { type, total: matching.length, applied };
    })
    .filter((r) => r.total > 0);

  // Top gap patterns — sentence-level, deduplicated
  const gapMap = new Map<string, number>();
  for (const ev of evaluations) {
    for (const gap of ev.gaps ?? []) {
      const key = gap.trim();
      if (key.length > 10) gapMap.set(key, (gapMap.get(key) ?? 0) + 1);
    }
  }
  const topGaps = Array.from(gapMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([gap, count]) => ({ gap, count }));

  return (
    <Shell activeItem="Analytics">
      <div className="grid gap-6">
        <PageHeader
          description="Pattern analysis across your job pipeline — score distributions, archetype performance, and conversion rates."
          eyebrow="Search intelligence"
          title="Analytics"
        />

        {/* Summary stats */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Jobs tracked" value={jobs.length} sub="Total in pipeline" />
          <StatCard
            label="Evaluated"
            value={evaluations.length}
            sub={jobs.length > 0 ? `${Math.round((evaluations.length / jobs.length) * 100)}% of pipeline` : undefined}
          />
          <StatCard
            label="Applied"
            value={appliedApps.length}
            sub={evaluations.length > 0 ? `${Math.round((appliedApps.length / evaluations.length) * 100)}% of evaluated` : undefined}
          />
          <StatCard label="Interviews" value={interviewApps.length} sub="Active or completed" />
        </section>

        {/* Pipeline funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline funnel</CardTitle>
            <CardDescription>Jobs and applications by stage.</CardDescription>
          </CardHeader>
          <div className="grid gap-3">
            {funnelStages.filter((s) => s.value > 0).map((stage) => {
              const pct = Math.min(100, Math.round((stage.value / Math.max(1, jobs.length)) * 100));
              return (
                <div key={stage.label} className="grid items-center gap-2" style={{ gridTemplateColumns: "9rem 1fr 2.5rem" }}>
                  <span className="text-sm text-muted">{stage.label}</span>
                  <ScoreBar value={stage.value} max={jobs.length} />
                  <span className="text-right text-sm font-medium text-ink">{stage.value}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Score vs outcome + Remote policy */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Score vs. outcome</CardTitle>
              <CardDescription>Where you're applying by fit score band.</CardDescription>
            </CardHeader>
            {scoreOutcome.some((b) => b.total > 0) ? (
              <div className="grid gap-3">
                {scoreOutcome.filter((b) => b.total > 0).map((band) => (
                  <div key={band.label} className="grid gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{band.label}</span>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span>{band.total} jobs</span>
                        {band.applied > 0 && <Badge tone="success">{band.applied} applied</Badge>}
                        {band.interviewing > 0 && <Badge tone="success">{band.interviewing} interviews</Badge>}
                        {band.rejected > 0 && <Badge tone="warning">{band.rejected} rejected</Badge>}
                      </div>
                    </div>
                    <ScoreBar value={band.applied} max={band.total} tone={band.tone} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState description="Apply to some jobs to see score-to-outcome correlation." title="No application data yet" />
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Remote policy</CardTitle>
              <CardDescription>Jobs and applications by work arrangement.</CardDescription>
            </CardHeader>
            {remoteConversion.length > 0 ? (
              <div className="grid gap-3">
                {remoteConversion.map((r) => {
                  const applyPct = r.total > 0 ? Math.round((r.applied / r.total) * 100) : 0;
                  return (
                    <div key={r.type} className="grid gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-ink">{r.type}</span>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span>{r.total} jobs</span>
                          {r.applied > 0 && <Badge tone="success">{r.applied} applied · {applyPct}%</Badge>}
                        </div>
                      </div>
                      <ScoreBar value={r.applied} max={r.total} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState description="Jobs with remote type data will appear here." title="No remote data" />
            )}
          </Card>
        </section>

        {/* Archetype performance + Gap patterns */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Archetype performance</CardTitle>
              <CardDescription>Role archetypes from evaluations, ranked by volume.</CardDescription>
            </CardHeader>
            {archetypes.length > 0 ? (
              <div className="grid gap-3">
                {archetypes.map((a) => (
                  <div key={a.name} className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{a.name}</span>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                        <span>{a.count} eval{a.count !== 1 ? "s" : ""}</span>
                        <span className="font-medium text-ink">{a.avgScore}%</span>
                        {a.applied > 0 && <Badge tone="success">{a.applied} applied</Badge>}
                      </div>
                    </div>
                    <ScoreBar value={a.avgScore} max={100} tone={a.avgScore >= 80 ? "success" : a.avgScore >= 60 ? "accent" : "warning"} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState description="Evaluate some jobs to see archetype breakdown." title="No evaluations yet" />
            )}
          </Card>

          <GlobalGapAddressingPanel
            topGaps={topGaps}
            initialSupplements={supplements.map((s) => ({ id: s.id, content: s.content, tags: s.tags }))}
          />
        </section>

        {/* Recent evaluations */}
        {evaluations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent evaluations</CardTitle>
              <CardDescription>Latest AI-evaluated roles with score and recommendation.</CardDescription>
            </CardHeader>
            <div className="grid gap-0.5">
              {evaluations.slice(0, 15).map((ev) => {
                const job = jobs.find((j) => j.id === ev.jobId);
                const scoreTone = ev.fitScore >= 80 ? "success" : ev.fitScore >= 60 ? "neutral" : "warning";
                return (
                  <div
                    key={ev.jobId}
                    className="grid items-center gap-4 rounded-control px-2 py-2 hover:bg-surface"
                    style={{ gridTemplateColumns: "1fr 4rem 1fr 9rem" }}
                  >
                    <div className="min-w-0">
                      {job ? (
                        <Link className="truncate font-medium text-accent hover:underline block" href={`/jobs/${ev.jobId}`}>
                          {job.title}
                        </Link>
                      ) : (
                        <span className="truncate font-medium text-ink block">{ev.jobId}</span>
                      )}
                      {job && <p className="truncate text-xs text-muted">{job.company}</p>}
                    </div>
                    <div className="text-right">
                      <Badge tone={scoreTone}>{ev.fitScore}%</Badge>
                    </div>
                    <p className="truncate text-xs text-muted">{ev.roleArchetype}</p>
                    <div>
                      <Badge
                        tone={
                          ev.recommendation === "Priority apply" || ev.recommendation === "Strong apply"
                            ? "success"
                            : ev.recommendation === "Skip"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {ev.recommendation}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </Shell>
  );
}
