"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { RANGE_SELECTION_HINT, useRangeSelection } from "@/components/ui/use-range-selection";
import type { CleanupCandidate, CleanupEvent, CleanupSummary } from "@/lib/jobs/cleanup-types";

const PAGE_SIZE = 25;
const LABELS = { closed: "Posting closed or unavailable", old_unverified: "30+ days old · Could not verify" };
function date(value: string) { return value ? new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleDateString() : "Unknown"; }

export function JobMaintenancePanel({ jobCount }: { jobCount: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [summary, setSummary] = useState<CleanupSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [sort, setSort] = useState("saved");
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [skipped, setSkipped] = useState<Array<{ id: string; reason: string; title?: string }>>([]);
  const cancellation = useRef<AbortController | null>(null);
  const archiveButton = useRef<HTMLButtonElement>(null);
  const confirmHeading = useRef<HTMLParagraphElement>(null);
  const busy = running || archiving;
  const candidates = summary?.candidates;
  const filtered = useMemo(() => (candidates ?? []).filter((job) =>
    (group === "all" || job.cleanupReason === group) && `${job.title} ${job.company} ${job.source}`.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => sort === "company" ? a.company.localeCompare(b.company) : sort === "role" ? a.title.localeCompare(b.title) : a.savedAt.localeCompare(b.savedAt)), [candidates, group, search, sort]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selection = useRangeSelection(visible.map((job) => job.id), selected, setSelected, JSON.stringify([search, group, sort, currentPage]), busy || confirming);

  async function verifyPostings() {
    setRunning(true); setError(null); setNotice(""); setSkipped([]); setSummary(null);
    setSelected(new Set()); selection.resetAnchor(); setConfirming(false); setPage(0);
    const controller = new AbortController(); cancellation.current = controller;
    let completed = false;
    try {
      const response = await fetch("/api/jobs/liveness", { method: "POST", headers: { Accept: "application/x-ndjson" }, signal: controller.signal });
      if (!response.ok || !response.body) throw new Error("Posting verification could not start. Try again.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffer = "";
      const receive = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as CleanupEvent;
        if (event.type === "error") throw new Error(event.message);
        setSummary(event.summary);
        if (event.type === "result") completed = true;
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        lines.forEach(receive);
        if (done) { if (buffer.trim()) receive(buffer); break; }
      }
      if (!completed) throw new Error("Verification ended early. Completed results are available; run again to check the rest.");
      setNotice("Verification complete. Review the reasons before choosing jobs to archive.");
    } catch (err) {
      if (controller.signal.aborted) setNotice("Verification stopped. Completed results are available below; unchecked jobs were kept.");
      else setError(err instanceof Error ? err.message : "Verification failed. Try again.");
    } finally { setRunning(false); cancellation.current = null; router.refresh(); }
  }

  async function archiveSelected() {
    setArchiving(true); setError(null);
    try {
      const response = await fetch("/api/jobs/liveness", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selected] }) });
      const result = await response.json() as { archivedIds: string[]; skipped: Array<{ id: string; reason: string }>; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Archiving failed. Try again.");
      const removed = new Set([...result.archivedIds, ...result.skipped.map((job) => job.id)]);
      setSkipped(result.skipped.map((item) => ({ ...item, title: candidates?.find((job) => job.id === item.id)?.title })));
      setSummary((current) => current ? { ...current, candidates: current.candidates.filter((job) => !removed.has(job.id)) } : current);
      setNotice(`${result.archivedIds.length} archived. ${result.skipped.length} kept because they are no longer eligible.`);
      setSelected(new Set()); selection.resetAnchor(); setConfirming(false); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Archiving failed"); }
    finally { setArchiving(false); }
  }
  function selectGroup(reason: CleanupCandidate["cleanupReason"]) {
    selection.resetAnchor();
    setSelected((previous) => new Set([...previous, ...(candidates ?? []).filter((job) => job.cleanupReason === reason).map((job) => job.id)]));
  }

  return (
    <section aria-labelledby="maintenance-heading" className="rounded-panel border border-border bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="maintenance-heading" className="text-sm font-semibold text-ink">Job list maintenance</h2>
          <p className="mt-1 text-xs text-muted">Check untouched Found jobs. Review closed postings and jobs saved 30+ days ago whose availability cannot be verified.</p>
          <p className="mt-1 text-xs text-muted">Jobs you have acted on are protected. Nothing is archived until you confirm.</p>
        </div>
        <Button disabled={busy || confirming || jobCount === 0} onClick={verifyPostings} type="button" variant="secondary">Verify active postings</Button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-sm text-muted">
        {running ? (summary ? `Checking posting links: ${summary.checked} of ${summary.total} checked. ${summary.protected} protected. Each link can take up to 12 seconds.` : "Preparing posting checks…") : notice}
      </div>
      {running && <Button className="mt-2" onClick={() => cancellation.current?.abort()} type="button" variant="secondary">Stop</Button>}
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      {summary && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{summary.checked} checked</Badge><Badge tone="neutral">{summary.protected} protected</Badge>
            <Badge tone="success">{summary.active} confirmed active</Badge><Badge tone="warning">{summary.uncertain} could not verify</Badge>
            <Badge tone="neutral">{summary.candidates.length} cleanup candidates</Badge>
          </div>
          {!running && summary.candidates.length === 0 && <p className="mt-3 text-sm text-muted">No cleanup candidates remain in these results.</p>}
          {summary.candidates.length > 0 && <>
            <p className="mt-3 text-xs text-muted">An old, unverified listing may still be open. Age is not proof of closure. {RANGE_SELECTION_HINT}</p>
            <div className="my-3 flex flex-wrap items-end gap-3">
              <label className="text-xs text-muted">Search candidates<input className="mt-1 block rounded-control border border-border bg-panel p-2 text-ink" value={search} disabled={confirming || archiving} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
              <label className="text-xs text-muted">Cleanup reason<select className="mt-1 block rounded-control border border-border bg-panel p-2 text-ink" value={group} disabled={confirming || archiving} onChange={(e) => { setGroup(e.target.value); setPage(0); }}><option value="all">All reasons</option><option value="closed">{LABELS.closed}</option><option value="old_unverified">{LABELS.old_unverified}</option></select></label>
              <label className="text-xs text-muted">Sort by<select className="mt-1 block rounded-control border border-border bg-panel p-2 text-ink" value={sort} disabled={confirming || archiving} onChange={(e) => { setSort(e.target.value); setPage(0); }}><option value="saved">Oldest saved first</option><option value="company">Company</option><option value="role">Role</option></select></label>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={busy || confirming} onClick={() => selectGroup("closed")}>Select all closed ({summary.candidates.filter((job) => job.cleanupReason === "closed").length})</Button>
              <Button type="button" variant="secondary" disabled={busy || confirming} onClick={() => selectGroup("old_unverified")}>Select all old unverified ({summary.candidates.filter((job) => job.cleanupReason === "old_unverified").length})</Button>
              <Button type="button" variant="quiet" disabled={busy || confirming || selected.size === 0} onClick={selection.clear}>Clear selection</Button>
            </div>
            <p className="mb-2 text-xs text-muted">Group selection includes all results in that reason, across pages and search filters.</p>
            <div className="overflow-x-auto" role="region" aria-label="Cleanup candidates" tabIndex={0}>
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-border"><th className="p-2"><input aria-label="Select all candidates on this page" type="checkbox" {...selection.header} /></th><th className="p-2">Job</th><th className="p-2">Saved</th><th className="p-2">Reason and evidence</th></tr></thead>
                <tbody>{visible.map((job) => <tr key={job.id} className="border-b border-border">
                  <td className="p-2"><input aria-label={`Select ${job.title} at ${job.company}`} type="checkbox" {...selection.checkbox(job.id)} /></td>
                  <td className="p-2"><Link className="font-medium text-accent" href={`/jobs/${job.id}`}>{job.title}</Link><p>{job.company}</p><p className="text-xs text-muted">{job.source}</p></td>
                  <td className="p-2 whitespace-nowrap">{date(job.savedAt)}</td>
                  <td className="p-2"><p className="font-medium">{LABELS[job.cleanupReason]}</p><p className="text-xs text-muted">{job.reason}</p><p className="text-xs text-muted">Checked {new Date(job.checkedAt).toLocaleString()}</p>{/^https?:\/\//i.test(job.evidenceUrl) && <a className="text-xs text-accent underline" href={job.evidenceUrl} target="_blank" rel="noreferrer">Checked posting link</a>}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" variant="quiet" disabled={currentPage === 0 || confirming || archiving} onClick={() => setPage(currentPage - 1)}>Previous</Button>
              <span className="text-xs text-muted">Page {currentPage + 1} of {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))} · {filtered.length} results</span>
              <Button type="button" variant="quiet" disabled={(currentPage + 1) * PAGE_SIZE >= filtered.length || confirming || archiving} onClick={() => setPage(currentPage + 1)}>Next</Button>
              <span className="text-sm" role="status">{selected.size} selected across all pages</span>
              <button ref={archiveButton} className="rounded-control border border-border px-3 py-2 text-sm font-medium disabled:opacity-50" type="button" disabled={busy || confirming || selected.size === 0} onClick={() => { setConfirming(true); requestAnimationFrame(() => confirmHeading.current?.focus()); }}>Archive selected</button>
            </div>
            {confirming && <div className="mt-3 rounded-control border border-border p-3">
              <p ref={confirmHeading} tabIndex={-1} className="text-sm font-medium">Archive {selected.size} selected jobs? You can restore them from Archived.</p>
              <p className="mt-1 text-xs text-muted">Protection is checked again before archiving. Jobs you have since acted on will be kept.</p>
              <div className="mt-3 flex gap-2"><Button type="button" disabled={archiving} onClick={archiveSelected}>{archiving ? "Archiving…" : `Confirm archive ${selected.size} jobs`}</Button><Button type="button" disabled={archiving} variant="secondary" onClick={() => { setConfirming(false); archiveButton.current?.focus(); }}>Cancel</Button></div>
            </div>}
          </>}
        </div>
      )}
      {skipped.length > 0 && <details className="mt-3 text-sm"><summary>Why jobs were kept</summary><ul>{skipped.map((job) => <li key={job.id}>{job.title ?? "Job"}: {job.reason}</li>)}</ul></details>}
      {summary && <Link className="mt-3 inline-block text-sm text-accent underline" href="/archived">View Archived to restore jobs</Link>}
    </section>
  );
}
