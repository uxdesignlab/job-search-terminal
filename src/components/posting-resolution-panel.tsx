"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import type { EmailImportEvidenceRecord } from "@/lib/db/queries";

type Candidate = {
  title: string;
  url: string;
  description: string;
};

type SearchResult = {
  query: string;
  candidates: Candidate[];
  externalSearchUrl: string;
  usedBrave: boolean;
};

type Props = {
  jobId: string;
  searchQuery: string;
  evidence: EmailImportEvidenceRecord[];
};

export function PostingResolutionPanel({ jobId, searchQuery, evidence }: Props) {
  const router = useRouter();
  const emailLinks = uniqueLinks(evidence.flatMap((item) => item.candidateLinks));
  const [postingUrl, setPostingUrl] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  async function searchCandidates() {
    setSearching(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/resolve-posting/search`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Posting search failed");
      setSearchResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posting search failed");
    } finally {
      setSearching(false);
    }
  }

  async function resolve(url: string) {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/resolve-posting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Could not resolve posting");
      setStatus(payload.descriptionFetched ? "Posting saved and description fetched." : "Posting saved. Review the job description manually.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve posting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 border-warning/35 bg-warning/8">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Resolve posting</CardTitle>
          <Badge tone="warning">Email lead</Badge>
        </div>
        <CardDescription>
          This job came from an email alert without a direct posting URL. Search only when you are ready to resolve this lead.
        </CardDescription>
      </CardHeader>

      <div className="grid gap-4">
        {evidence.length > 0 ? (
          <div className="grid gap-2 rounded-control border border-border bg-panel px-3 py-2 text-sm">
            <p className="font-medium text-ink">Email evidence</p>
            {evidence.slice(0, 2).map((item) => (
              <div className="grid gap-1 text-xs text-muted" key={item.id}>
                <p>{item.emailSubject || item.sourceFilename}</p>
                {item.extractedSnippet ? <p className="text-ink">{item.extractedSnippet}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        {emailLinks.length > 0 ? (
          <div className="grid gap-2 rounded-control border border-border bg-panel px-3 py-2 text-sm">
            <p className="font-medium text-ink">Links from the email</p>
            <div className="grid gap-2">
              {emailLinks.slice(0, 5).map((link) => (
                <div className="flex flex-wrap items-center gap-2 text-xs" key={link}>
                  <a className="min-w-0 flex-1 break-all text-accent hover:underline" href={link} rel="noreferrer" target="_blank">
                    {formatLinkLabel(link)}
                  </a>
                  <Button disabled={saving} onClick={() => void resolve(link)} type="button" variant="secondary">
                    Use this URL
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={searching || saving} onClick={searchCandidates} type="button" variant="secondary">
            {searching ? "Searching..." : "Find posting"}
          </Button>
          <span className="text-xs text-muted">Query: {searchQuery}</span>
        </div>

        {searchResult ? (
          <div className="grid gap-2">
            {searchResult.candidates.length > 0 ? (
              searchResult.candidates.map((candidate) => (
                <div className="grid gap-1 rounded-control border border-border bg-panel px-3 py-2" key={candidate.url}>
                  <a className="text-sm font-medium text-accent hover:underline" href={candidate.url} rel="noreferrer" target="_blank">
                    {candidate.title}
                  </a>
                  {candidate.description ? <p className="text-xs text-muted">{candidate.description}</p> : null}
                  <div>
                    <Button disabled={saving} onClick={() => void resolve(candidate.url)} type="button" variant="secondary">
                      Use this posting
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                No API candidates found.{" "}
                <a className="font-medium text-accent hover:underline" href={searchResult.externalSearchUrl} rel="noreferrer" target="_blank">
                  Open web search
                </a>
              </p>
            )}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            disabled={saving}
            label="Posting URL"
            onChange={(event) => setPostingUrl(event.target.value)}
            placeholder="https://..."
            value={postingUrl}
          />
          <div className="flex items-end">
            <Button disabled={saving || !postingUrl.trim()} onClick={() => void resolve(postingUrl.trim())} type="button">
              {saving ? "Saving..." : "Save URL"}
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        {status ? <p className="text-sm font-medium text-success">{status}</p> : null}
      </div>
    </Card>
  );
}

function uniqueLinks(links: string[]): string[] {
  return [...new Set(links.filter(Boolean))];
}

function formatLinkLabel(link: string): string {
  try {
    const url = new URL(link);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return link;
  }
}
