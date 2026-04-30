import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, Select, Shell, Table, Td, Th } from "@/components/ui";
import { formatPostedDate } from "@/lib/dates";
import { getJobs } from "@/lib/db/queries";
import { AddJobModal } from "@/components/AddJobModal";

export const dynamic = "force-dynamic";

function toneForRecommendation(recommendation: string) {
  if (recommendation === "Priority apply" || recommendation === "Strong apply") return "success" as const;
  if (recommendation === "Skip") return "danger" as const;
  return "warning" as const;
}

export default function JobsPage() {
  const jobs = getJobs();

  return (
    <Shell activeItem="Jobs">
      <div className="grid gap-6">
        <PageHeader
          description="Discovered jobs with fit scoring, posted dates, status, and recommended action."
          eyebrow="Position dashboard"
          title="Jobs"
          actions={<AddJobModal />}
        />

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter the position dashboard by status, fit, posted date, and priority.</CardDescription>
          </CardHeader>
          <div className="grid gap-4 md:grid-cols-4">
            <Select label="Status" name="status">
              <option>All statuses</option>
              <option>Found</option>
              <option>Reviewed</option>
              <option>Applied</option>
              <option>Skipped</option>
            </Select>
            <Select label="Fit score" name="fit-score">
              <option>All scores</option>
              <option>80% and above</option>
              <option>60% and above</option>
              <option>Below 60%</option>
            </Select>
            <Select label="Posted date" name="posted-date">
              <option>All posted dates</option>
              <option>Known posted date</option>
              <option>Posted date unavailable</option>
            </Select>
            <Select label="Sort" name="sort">
              <option>Highest match</option>
              <option>Freshest first</option>
              <option>Needs action</option>
            </Select>
          </div>
        </Card>

        {jobs.length === 0 ? (
          <EmptyState
            description="Run a scan from the dashboard to add discovered roles before reviewing fit or status."
            title="No jobs found yet"
          />
        ) : null}

        <div className="grid gap-4 lg:hidden">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <CardTitle>
                  <Link className="text-accent hover:underline" href={`/jobs/${job.id}`}>
                    {job.title}
                  </Link>
                </CardTitle>
                <CardDescription>{job.company} · {job.location}</CardDescription>
              </CardHeader>
              <div className="flex flex-wrap gap-2">
                <Badge>{job.fitScore}% fit</Badge>
                <Badge>{formatPostedDate(job)}</Badge>
                <Badge tone={toneForRecommendation(job.recommendation)}>{job.recommendation}</Badge>
                {job.url ? (
                  <a className="text-xs font-medium text-accent hover:underline" href={job.url} rel="noreferrer" target="_blank">
                    Job posting ↗
                  </a>
                ) : null}
              </div>
            </Card>
          ))}
        </div>

        {jobs.length > 0 ? (
        <div className="hidden lg:block">
          <Table>
            <thead>
              <tr>
                <Th scope="col">Role</Th>
                <Th scope="col">Location</Th>
                <Th scope="col">Fit</Th>
                <Th scope="col">Posted</Th>
                <Th scope="col">Status</Th>
                <Th scope="col">Action</Th>
                <Th scope="col">Posting</Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <Td>
                    <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                      {job.title}
                    </Link>
                    <p className="text-xs text-muted">{job.company}</p>
                  </Td>
                  <Td>{job.location}</Td>
                  <Td>{job.fitScore}%</Td>
                  <Td>
                    <Badge>{formatPostedDate(job)}</Badge>
                  </Td>
                  <Td>{job.status}</Td>
                  <Td>
                    <Badge tone={toneForRecommendation(job.recommendation)}>{job.recommendation}</Badge>
                  </Td>
                  <Td>
                    {job.url ? (
                      <a className="font-medium text-accent hover:underline" href={job.url} rel="noreferrer" target="_blank">
                        ↗
                      </a>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        ) : null}
      </div>
    </Shell>
  );
}
