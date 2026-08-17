import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { EvidenceBankPanel } from "@/components/evidence-bank-panel";
import { getGapEvidenceBacklog, getGapEvidenceCounts } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function EvidencePage() {
  const entries = getGapEvidenceBacklog();
  const counts = getGapEvidenceCounts();
  const outstanding = counts.needsDetail + counts.recurringUnanswered;

  return (
    // Not a top-level nav item — reached from Analytics and the Dashboard, so
    // Analytics stays lit to show where this page hangs off.
    <Shell activeItem="Analytics">
      <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
        <Link className="text-sm text-accent hover:underline" href="/analytics">
          ← Back to Analytics
        </Link>
        <PageHeader
          description="Every gap and red flag your evaluations raised, in one place. Answer each one once — the answer is reused on every application, including future roles that raise the same gap."
          eyebrow="Reusable experience"
          title="Evidence bank"
        />

        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard
            detail={counts.needsDetail > 0 ? "Finish these" : "Clear"}
            label="Needs detail"
            tone={counts.needsDetail > 0 ? "warning" : "success"}
            value={String(counts.needsDetail)}
          />
          <StatCard
            detail={counts.recurringUnanswered > 0 ? "Asked by 2+ roles" : "Clear"}
            label="Recurring, unanswered"
            tone={counts.recurringUnanswered > 0 ? "neutral" : "success"}
            value={String(counts.recurringUnanswered)}
          />
          <StatCard
            detail="Reused automatically"
            label="Answered"
            tone="success"
            value={String(counts.addressed)}
          />
        </section>

        {outstanding > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                {outstanding} {outstanding === 1 ? "gap is" : "gaps are"} worth finishing
              </CardTitle>
              <CardDescription>
                Resume tailoring only draws on answers marked <strong>Answered</strong>. Anything still marked
                &ldquo;Needs detail&rdquo; is parked here and is not used in generated documents yet — finishing it
                puts that evidence to work everywhere at once.{" "}
                {counts.totalUnanswered > counts.recurringUnanswered && (
                  <>
                    A further {counts.totalUnanswered - counts.recurringUnanswered} gaps were each raised by a
                    single role; answer those on the job page, or open <strong>Every gap</strong> below.
                  </>
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <EvidenceBankPanel entries={entries} />
      </div>
    </Shell>
  );
}
