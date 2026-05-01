"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import type { CompanyResearchRecord } from "@/lib/db/types";

type AxisKey = "aiStrategy" | "recentMovements" | "engineeringCulture" | "technicalChallenges" | "competitivePosition" | "candidateAngle";

type AxisResult = {
  axis: AxisKey;
  label: string;
  content: string;
};

const AXIS_ORDER: AxisKey[] = ["aiStrategy", "recentMovements", "engineeringCulture", "technicalChallenges", "competitivePosition", "candidateAngle"];

const AXIS_LABELS: Record<AxisKey, string> = {
  aiStrategy: "AI & technology strategy",
  recentMovements: "Recent movements & news",
  engineeringCulture: "Engineering culture",
  technicalChallenges: "Technical challenges",
  competitivePosition: "Competitive position",
  candidateAngle: "Your angle for this company"
};

function savedToAxes(saved: CompanyResearchRecord): Partial<Record<AxisKey, AxisResult>> {
  const result: Partial<Record<AxisKey, AxisResult>> = {};
  for (const axis of AXIS_ORDER) {
    const content = saved[axis];
    if (content) result[axis] = { axis, label: AXIS_LABELS[axis], content };
  }
  return result;
}

type Props = {
  jobId: string;
  saved: CompanyResearchRecord | null;
};

export function ResearchClient({ jobId, saved }: Props) {
  const [axes, setAxes] = useState<Partial<Record<AxisKey, AxisResult>>>(
    saved ? savedToAxes(saved) : {}
  );
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    saved ? "done" : "idle"
  );
  const [currentLabel, setCurrentLabel] = useState("");
  const [error, setError] = useState("");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => { esRef.current?.close(); }, []);

  const startResearch = useCallback(() => {
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

  const hasAny = AXIS_ORDER.some((k) => axes[k]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>6-axis company research</CardTitle>
          <CardDescription>
            AI-generated research across technology strategy, culture, competitive position, and your personal angle.
            {saved && (
              <span className="ml-2 text-xs text-muted">Last generated {saved.createdAt.slice(0, 10)} · {saved.providerUsed}</span>
            )}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          {status !== "loading" ? (
            <Button onClick={startResearch} type="button" variant={hasAny ? "secondary" : "primary"}>
              {hasAny ? "Re-research" : "Start research"}
            </Button>
          ) : (
            <Button onClick={stop} type="button" variant="secondary">Cancel</Button>
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
                {result?.label ?? AXIS_LABELS[axisKey]}
                {isLoading && <span className="ml-2 animate-pulse text-sm font-normal text-muted">Generating...</span>}
              </CardTitle>
            </CardHeader>
            {result ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{result.content}</p>
            ) : !isLoading ? (
              <EmptyState description="Click 'Start research' to generate this section." title="Not yet generated" />
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
