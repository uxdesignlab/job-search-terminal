"use client";

import { useCallback, useState } from "react";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { ProgressModal } from "@/components/ui/progress-modal";
import type { OutreachDraftRecord } from "@/lib/db/types";

type ContactType = "recruiter" | "hiring_manager" | "peer";

type DraftDisplay = {
  contactType: ContactType;
  message: string;
  charCount: number;
  modelUsed: string;
  providerUsed: string;
};

const CONTACT_LABELS: Record<ContactType, string> = {
  recruiter: "Recruiter outreach",
  hiring_manager: "Hiring manager note",
  peer: "Peer / team member"
};

const CONTACT_ORDER: ContactType[] = ["recruiter", "hiring_manager", "peer"];
const CHAR_LIMIT = 300;

function savedToDrafts(saved: OutreachDraftRecord[]): DraftDisplay[] {
  return CONTACT_ORDER.flatMap((ct) => {
    const record = saved.find((r) => r.contactType === ct);
    return record
      ? [{ contactType: ct, message: record.message, charCount: record.charCount, modelUsed: record.modelUsed, providerUsed: record.providerUsed }]
      : [];
  });
}

type Props = {
  jobId: string;
  saved: OutreachDraftRecord[];
};

export function OutreachClient({ jobId, saved }: Props) {
  const [drafts, setDrafts] = useState<DraftDisplay[]>(savedToDrafts(saved));
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    saved.length > 0 ? "done" : "idle"
  );
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modelLine, setModelLine] = useState("");

  const generate = useCallback(async () => {
    setStatus("loading");
    setError("");
    setDrafts([]);
    setModalOpen(true);
    setModelLine("");
    fetch("/api/ai/active")
      .then((r) => r.json() as Promise<{ providerName: string; modelName: string }>)
      .then((d) => { if (d.modelName) setModelLine(`${d.modelName} · ${d.providerName}`); })
      .catch(() => {});

    try {
      const res = await fetch(`/api/outreach/${jobId}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Generation failed");
      }
      const data = await res.json() as { drafts: DraftDisplay[] };
      setDrafts(data.drafts);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [jobId]);

  function closeModal() {
    setModalOpen(false);
  }

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const hasDrafts = drafts.length > 0;
  const lastDate = saved[0]?.createdAt?.slice(0, 10);

  return (
    <>
    <ProgressModal
      open={modalOpen}
      phase={status === "loading" ? "running" : "done"}
      title="Generating outreach messages"
      message="Writing LinkedIn messages for recruiter, hiring manager, and peer…"
      subtitle="Each message is kept under 300 characters for LinkedIn."
      modelLine={modelLine || undefined}
      error={status === "error" ? (error || "Generation failed") : null}
      onClose={closeModal}
    >
      <p className="text-sm text-success">3 messages ready — scroll down to copy and send them.</p>
    </ProgressModal>

    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate outreach messages</CardTitle>
          <CardDescription>
            AI writes three under-300-character LinkedIn messages — one each for a recruiter, the hiring manager, and a peer on the team.
            {lastDate && <span className="ml-2 text-xs text-muted">Last generated {lastDate}</span>}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={status === "loading"} onClick={generate} type="button" variant={hasDrafts ? "secondary" : "primary"}>
            {status === "loading" ? "Generating..." : hasDrafts ? "Regenerate" : "Generate messages"}
          </Button>
          {status === "done" && <Badge tone="success">3 messages ready</Badge>}
          {status === "error" && <Badge tone="warning">Error</Badge>}
        </div>
      </Card>

      {hasDrafts ? (
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
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button onClick={() => copyToClipboard(draft.message, key)} type="button">
                    {isCopied ? "Copied!" : "Copy"}
                  </Button>
                  {draft.modelUsed && (
                    <span className="text-xs text-muted font-mono">{draft.modelUsed} · {draft.providerUsed}</span>
                  )}
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
    </>
  );
}
