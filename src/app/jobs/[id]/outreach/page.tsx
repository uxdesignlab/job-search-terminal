"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

type ContactType = "recruiter" | "hiring_manager" | "peer";

type OutreachDraft = {
  contactType: ContactType;
  message: string;
  charCount: number;
};

type OutreachPageProps = {
  params: Promise<{ id: string }>;
};

const CONTACT_LABELS: Record<ContactType, string> = {
  recruiter: "Recruiter outreach",
  hiring_manager: "Hiring manager note",
  peer: "Peer / team member"
};

const CHAR_LIMIT = 300;

export default function OutreachPage({ params }: OutreachPageProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setJobId(p.id));
  }, [params]);

  const generate = useCallback(async () => {
    if (!jobId) return;
    setStatus("loading");
    setError("");
    setDrafts([]);

    try {
      const res = await fetch(`/api/outreach/${jobId}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Generation failed");
      }
      const data = await res.json() as { drafts: OutreachDraft[] };
      setDrafts(data.drafts);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [jobId]);

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!jobId) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <Link className="text-sm text-accent hover:underline" href={`/jobs/${jobId}`}>
            ← Back to job
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-ink">LinkedIn Outreach</h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate outreach messages</CardTitle>
              <CardDescription>
                AI writes three under-300-character LinkedIn messages — one each for a recruiter, the hiring manager, and a peer on the team.
              </CardDescription>
            </CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={status === "loading"} onClick={generate} type="button">
                {status === "loading" ? "Generating..." : drafts.length > 0 ? "Regenerate" : "Generate messages"}
              </Button>
              {status === "done" && <Badge tone="success">3 messages ready</Badge>}
              {status === "error" && <Badge tone="warning">Error</Badge>}
            </div>
            {error && <p className="mt-2 text-sm text-warning">{error}</p>}
          </Card>

          {drafts.length > 0 ? (
            <div className="grid gap-4">
              {drafts.map((draft) => {
                const key = draft.contactType;
                const isCopied = copied === key;
                const isNearLimit = draft.charCount > 260;
                return (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle>{CONTACT_LABELS[draft.contactType]}</CardTitle>
                      <CardDescription>
                        <span className={isNearLimit ? "text-warning" : ""}>{draft.charCount}</span> / {CHAR_LIMIT} characters
                      </CardDescription>
                    </CardHeader>
                    <div className="rounded-control border border-border bg-surface p-4">
                      <p className="text-sm leading-relaxed text-ink">{draft.message}</p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        onClick={() => copyToClipboard(draft.message, key)}
                        type="button"
                      >
                        {isCopied ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>How to use these messages</CardTitle>
                <CardDescription>Tips for LinkedIn outreach that gets responses.</CardDescription>
              </CardHeader>
              <ul className="grid gap-2 text-sm text-ink">
                {[
                  "Send to the recruiter within 24 hours of applying — timing matters.",
                  "Find the hiring manager via LinkedIn search using company + role title.",
                  "Peer messages work best when you can reference their specific work (talk, blog post, open-source project).",
                  "Customize the generated message with the person's name before sending.",
                  "Don't send all three on the same day — space them 2–3 days apart."
                ].map((tip) => (
                  <li className="rounded-control border border-border bg-surface px-3 py-2" key={tip}>
                    {tip}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
