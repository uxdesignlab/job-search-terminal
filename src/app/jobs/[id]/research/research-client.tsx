"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

function ResearchContent({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-sm leading-relaxed text-muted">No content available.</p>;
  }

  return (
    <div className="text-sm leading-7 text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="mt-5 text-base font-semibold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h4 className="mt-4 text-sm font-semibold first:mt-0">{children}</h4>,
          h3: ({ children }) => <h5 className="mt-4 text-sm font-medium text-ink/90 first:mt-0">{children}</h5>,
          p: ({ children }) => <p className="mt-3 text-sm leading-7 text-ink/95 first:mt-0">{children}</p>,
          ul: ({ children }) => <ul className="mt-3 ml-5 list-disc space-y-1.5 first:mt-0">{children}</ul>,
          ol: ({ children }) => <ol className="mt-3 ml-5 list-decimal space-y-1.5 first:mt-0">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mt-4 border-l-2 border-border pl-4 text-muted first:mt-0">{children}</blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-accent underline underline-offset-2 hover:opacity-90"
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">{children}</code>
          ),
          table: ({ children }) => (
            <div className="mt-4 overflow-x-auto first:mt-0">
              <table className="w-full min-w-[480px] border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
          th: ({ children }) => <th className="border border-border px-2 py-1.5 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1.5 align-top">{children}</td>
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

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
              <ResearchContent content={result.content} />
            ) : !isLoading ? (
              <EmptyState description="Click 'Start research' to generate this section." title="Not yet generated" />
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
