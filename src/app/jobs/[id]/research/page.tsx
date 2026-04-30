"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui";

type AxisKey = "aiStrategy" | "recentMovements" | "engineeringCulture" | "technicalChallenges" | "competitivePosition" | "candidateAngle";

type AxisResult = {
  axis: AxisKey;
  label: string;
  content: string;
};

type ResearchPageProps = {
  params: Promise<{ id: string }>;
};

const AXIS_ORDER: AxisKey[] = ["aiStrategy", "recentMovements", "engineeringCulture", "technicalChallenges", "competitivePosition", "candidateAngle"];

export default function ResearchPage({ params }: ResearchPageProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [axes, setAxes] = useState<Partial<Record<AxisKey, AxisResult>>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [currentLabel, setCurrentLabel] = useState("");
  const [error, setError] = useState("");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    params.then((p) => setJobId(p.id));
  }, [params]);

  const startResearch = useCallback(() => {
    if (!jobId) return;
    setAxes({});
    setStatus("loading");
    setError("");
    setCurrentLabel("Researching company...");

    esRef.current?.close();
    const es = new EventSource(`/api/research/${jobId}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as {
        axis: string;
        label?: string;
        content?: string;
        done: boolean;
        error?: string;
      };

      if (data.done) {
        if (data.axis === "error") {
          setError(data.error ?? "Research failed");
          setStatus("error");
        } else {
          setStatus("done");
          setCurrentLabel("");
        }
        es.close();
        return;
      }

      if (data.axis && data.label && data.content) {
        const axis = data.axis as AxisKey;
        setAxes((prev) => ({ ...prev, [axis]: { axis, label: data.label!, content: data.content! } }));
        setCurrentLabel(`Researching: ${data.label}...`);
      }
    };

    es.onerror = () => {
      setError("Connection lost. Please try again.");
      setStatus("error");
      es.close();
    };
  }, [jobId]);

  const stop = () => {
    esRef.current?.close();
    setStatus("idle");
    setCurrentLabel("");
  };

  if (!jobId) return null;

  const completedAxes = AXIS_ORDER.filter((k) => axes[k]);
  const hasAny = completedAxes.length > 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <Link className="text-sm text-accent hover:underline" href={`/jobs/${jobId}`}>
            ← Back to job
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-ink">Company Research</h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>6-axis company research</CardTitle>
              <CardDescription>
                AI-generated research across technology strategy, culture, competitive position, and your personal angle.
              </CardDescription>
            </CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              {status !== "loading" ? (
                <Button onClick={startResearch} type="button">
                  {hasAny ? "Re-research" : "Start research"}
                </Button>
              ) : (
                <Button onClick={stop} type="button">
                  Cancel
                </Button>
              )}
              {status === "loading" && (
                <span className="animate-pulse text-sm text-muted">{currentLabel}</span>
              )}
              {status === "done" && <Badge tone="success">Research complete</Badge>}
              {status === "error" && <Badge tone="warning">Error</Badge>}
            </div>
            {error && <p className="mt-2 text-sm text-warning">{error}</p>}
          </Card>

          {AXIS_ORDER.map((axisKey) => {
            const result = axes[axisKey];
            const isLoading = status === "loading" && !result;
            return (
              <Card key={axisKey} className={isLoading ? "opacity-40" : ""}>
                <CardHeader>
                  <CardTitle>
                    {result?.label ?? AXIS_KEY_LABELS[axisKey]}
                    {isLoading && <span className="ml-2 animate-pulse text-sm font-normal text-muted">Generating...</span>}
                  </CardTitle>
                </CardHeader>
                {result ? (
                  <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">{result.content}</p>
                ) : !isLoading ? (
                  <EmptyState description="Click 'Start research' to generate this section." title="Not yet generated" />
                ) : null}
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}

const AXIS_KEY_LABELS: Record<AxisKey, string> = {
  aiStrategy: "AI & technology strategy",
  recentMovements: "Recent movements & news",
  engineeringCulture: "Engineering culture",
  technicalChallenges: "Technical challenges",
  competitivePosition: "Competitive position",
  candidateAngle: "Your angle for this company"
};
