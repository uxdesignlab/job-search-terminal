import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Select, Shell, Table, Td, Th } from "@/components/ui";
import { mockJobs } from "@/data/mock/jobs";

function toneForRecommendation(recommendation: string) {
  if (recommendation === "Priority apply" || recommendation === "Strong apply") return "success" as const;
  if (recommendation === "Skip") return "danger" as const;
  return "warning" as const;
}

export default function JobsPage() {
  return (
    <Shell activeItem="Jobs">
      <div className="grid gap-6">
        <PageHeader
          description="Discovered jobs with filters, fit scoring, freshness labels, status, and recommended action."
          eyebrow="Position dashboard"
          title="Jobs"
        />

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter the position dashboard by status, fit, freshness, and priority.</CardDescription>
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
            <Select label="Freshness" name="freshness">
              <option>All freshness</option>
              <option>New today</option>
              <option>New this week</option>
              <option>Recently found</option>
            </Select>
            <Select label="Sort" name="sort">
              <option>Highest match</option>
              <option>Freshest first</option>
              <option>Needs action</option>
            </Select>
          </div>
        </Card>

        <div className="grid gap-4 lg:hidden">
          {mockJobs.map((job) => (
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
                <Badge>{job.freshness}</Badge>
                <Badge tone={toneForRecommendation(job.recommendation)}>{job.recommendation}</Badge>
              </div>
            </Card>
          ))}
        </div>

        <div className="hidden lg:block">
          <Table>
            <thead>
              <tr>
                <Th scope="col">Role</Th>
                <Th scope="col">Location</Th>
                <Th scope="col">Fit</Th>
                <Th scope="col">Freshness</Th>
                <Th scope="col">Status</Th>
                <Th scope="col">Action</Th>
              </tr>
            </thead>
            <tbody>
              {mockJobs.map((job) => (
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
                    <Badge>{job.freshness}</Badge>
                  </Td>
                  <Td>{job.status}</Td>
                  <Td>
                    <Badge tone={toneForRecommendation(job.recommendation)}>{job.recommendation}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </Shell>
  );
}
