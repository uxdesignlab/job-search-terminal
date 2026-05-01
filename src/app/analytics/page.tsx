import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { getAllEvaluations, getApplications, getFunnelStages, getJobs } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const jobs = getJobs();
  const evaluations = getAllEvaluations();
  const applications = getApplications();
  const funnelStages = getFunnelStages();

  // Score-outcome correlation buckets
  const scoreBuckets = [
    { label: "80–100%", min: 80, max: 100 },
    { label: "60–79%", min: 60, max: 79 },
    { label: "40–59%", min: 40, max: 59 },
    { label: "0–39%", min: 0, max: 39 }
  ];

  const scoreOutcome = scoreBuckets.map((bucket) => {
    const inBucket = applications.filter((a) => a.fitScore >= bucket.min && a.fitScore <= bucket.max);
    const applied = inBucket.filter((a) => ["Applied", "Follow-up needed", "Recruiter responded", "Interviewing", "Offer"].includes(a.status)).length;
    const rejected = inBucket.filter((a) => a.status === "Rejected").length;
    const interviewing = inBucket.filter((a) => ["Interviewing", "Offer"].includes(a.status)).length;
    return { ...bucket, total: inBucket.length, applied, rejected, interviewing };
  });

  // Archetype performance
  const archetypeMap = new Map<string, { count: number; applied: number; score: number }>();
  for (const ev of evaluations) {
    const archetype = ev.roleArchetype || "Unknown";
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
    .slice(0, 10);

  // Remote policy conversion
  const remoteTypes = ["Remote", "Hybrid", "On-site", "Flexible"];
  const remoteConversion = remoteTypes.map((type) => {
    const matching = jobs.filter((j) => j.remoteType?.toLowerCase().includes(type.toLowerCase()));
    const applied = matching.filter((j) => applications.some((a) => a.jobId === j.id && ["Applied", "Interviewing", "Offer"].includes(a.status))).length;
    return { type, total: matching.length, applied };
  }).filter((r) => r.total > 0);

  // Top, gap, patterns from evaluations
  const gapMap = new Map<string, number>();
  for (const ev of evaluations) {
    for (const gap of ev.gaps ?? []) {
      const key = gap.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      if (key) gapMap.set(key, (gapMap.get(key) ?? 0) + 1);
    }
  }
  const topGaps = Array.from(gapMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([gap, count]) => ({ gap, count }));

  const summaryStats = [
    { label: "Jobs tracked", value: jobs.length, detail: "Total jobs in pipeline" },
    { label: "Evaluated", value: evaluations.length, detail: "With AI or rule-based evaluation" },
    { label: "Applied", value: applications.filter((a) => ["Applied", "Follow-up needed", "Recruiter responded", "Interviewing", "Offer"].includes(a.status)).length, detail: "Submitted applications" },
    { label: "Interviews", value: applications.filter((a) => ["Interviewing", "Offer"].includes(a.status)).length, detail: "Active or completed interview cycles" }
  ];

  return (
    <Shell activeItem="Analytics">
      <div className="grid gap-6">
        <PageHeader
          description="Pattern analysis across your job pipeline — score distributions, archetype performance, and conversion rates."
          eyebrow="Search intelligence"
          title="Analytics"
        />

        <section aria-label="Pipeline summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryStats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={String(stat.value)} detail={stat.detail} />
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline funnel</CardTitle>
            <CardDescription>Jobs and applications by stage.</CardDescription>
          </CardHeader>
          <div className="grid gap-2">
            {funnelStages.filter((s) => s.value > 0).map((stage) => {
              const pct = Math.min(100, Math.round((stage.value / Math.max(1, jobs.length)) * 100));
              return (
                <div key={stage.label} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm text-muted">{stage.label}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-surface" style={{ height: 8 }}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-medium text-ink">{stage.value}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Score vs. outcome</CardTitle>
              <CardDescription>Application rates by fit score band.</CardDescription>
            </CardHeader>
            {scoreOutcome.some((b) => b.total > 0) ? (
              <Table>
                <thead>
                  <tr>
                    <Th scope="col">Score band</Th>
                    <Th scope="col">Total</Th>
                    <Th scope="col">Applied</Th>
                    <Th scope="col">Interviews</Th>
                    <Th scope="col">Rejected</Th>
                  </tr>
                </thead>
                <tbody>
                  {scoreOutcome.map((band) => (
                    <tr key={band.label}>
                      <Td><span className="font-medium">{band.label}</span></Td>
                      <Td>{band.total}</Td>
                      <Td>
                        {band.applied > 0
                          ? <Badge tone="success">{band.applied}</Badge>
                          : <span className="text-muted">—</span>
                        }
                      </Td>
                      <Td>
                        {band.interviewing > 0
                          ? <Badge tone="success">{band.interviewing}</Badge>
                          : <span className="text-muted">—</span>
                        }
                      </Td>
                      <Td>
                        {band.rejected > 0
                          ? <Badge tone="warning">{band.rejected}</Badge>
                          : <span className="text-muted">—</span>
                        }
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState
                description="Apply to some jobs to see score-to-outcome correlation."
                title="No application data yet"
              />
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Remote policy conversion</CardTitle>
              <CardDescription>Application rates by work arrangement.</CardDescription>
            </CardHeader>
            {remoteConversion.length > 0 ? (
              <div className="grid gap-3">
                {remoteConversion.map((r) => (
                  <div key={r.type} className="flex items-center justify-between rounded-control border border-border bg-surface px-3 py-2">
                    <span className="text-sm font-medium text-ink">{r.type}</span>
                    <div className="flex gap-2">
                      <Badge>{r.total} jobs</Badge>
                      {r.applied > 0 && <Badge tone="success">{r.applied} applied</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState description="Jobs with remote type data will appear here." title="No remote data" />
            )}
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Archetype performance</CardTitle>
              <CardDescription>Evaluation archetypes ranked by volume.</CardDescription>
            </CardHeader>
            {archetypes.length > 0 ? (
              <Table>
                <thead>
                  <tr>
                    <Th scope="col">Archetype</Th>
                    <Th scope="col">Evals</Th>
                    <Th scope="col">Avg score</Th>
                    <Th scope="col">Applied</Th>
                  </tr>
                </thead>
                <tbody>
                  {archetypes.map((a) => (
                    <tr key={a.name}>
                      <Td><span className="font-medium">{a.name}</span></Td>
                      <Td>{a.count}</Td>
                      <Td>{a.avgScore}%</Td>
                      <Td>
                        {a.applied > 0
                          ? <Badge tone="success">{a.applied}</Badge>
                          : <span className="text-muted">0</span>
                        }
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState description="Evaluate some jobs to see archetype breakdown." title="No evaluations yet" />
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top gap patterns</CardTitle>
              <CardDescription>Most common skill gaps across evaluated roles.</CardDescription>
            </CardHeader>
            {topGaps.length > 0 ? (
              <div className="grid gap-2">
                {topGaps.map(({ gap, count }) => {
                  const pct = Math.min(100, Math.round((count / Math.max(1, topGaps[0].count)) * 100));
                  return (
                    <div key={gap} className="flex items-center gap-3">
                      <span className="flex-1 truncate text-sm text-ink capitalize">{gap}</span>
                      <div className="w-24 overflow-hidden rounded-full bg-surface" style={{ height: 6 }}>
                        <div className="h-full rounded-full bg-warning/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs font-medium text-muted">{count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState description="Gap, patterns, are, extracted from job evaluations." title="No gap data yet" />
            )}
          </Card>
        </section>

        {evaluations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent evaluations</CardTitle>
              <CardDescription>Latest AI-evaluated roles with score and recommendation.</CardDescription>
            </CardHeader>
            <Table>
              <thead>
                <tr>
                  <Th scope="col">Role</Th>
                  <Th scope="col">Score</Th>
                  <Th scope="col">Archetype</Th>
                  <Th scope="col">Recommendation</Th>
                </tr>
              </thead>
              <tbody>
                {evaluations.slice(0, 15).map((ev) => {
                  const job = jobs.find((j) => j.id === ev.jobId);
                  return (
                    <tr key={ev.jobId}>
                      <Td>
                        {job ? (
                          <Link className="font-medium text-accent hover:underline" href={`/jobs/${ev.jobId}`}>
                            {job.title}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{ev.jobId}</span>
                        )}
                        {job && <p className="text-xs text-muted">{job.company}</p>}
                      </Td>
                      <Td>{ev.fitScore}%</Td>
                      <Td><span className="text-xs text-muted">{ev.roleArchetype}</span></Td>
                      <Td>
                        <Badge tone={ev.recommendation === "Priority apply" ? "success" : ev.recommendation === "Skip" ? "warning" : "neutral"}>
                          {ev.recommendation}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </Shell>
  );
}
