"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ResumeBuilderSection, ResumeBuilderVersionStatus, ResumeRecord, ResumeSectionMode, ResumeSectionModeInput } from "@/lib/db/types";

type Props = {
  jobId: string;
  resumes: ResumeRecord[];
  recommendedResume: string;
  hasExistingDocument: boolean;
  resumeVersions: Record<string, {
    status: ResumeBuilderVersionStatus;
    sections: ResumeBuilderSection[];
  }>;
};

export function ResumeGeneratorModal({ jobId, resumes, recommendedResume, hasExistingDocument, resumeVersions }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(() => {
    const rec = resumes.find((r) => r.name === recommendedResume);
    return rec?.id ?? resumes[0]?.id ?? "";
  });
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");
  const [error, setError] = useState("");
  const [sectionModes, setSectionModes] = useState<Record<string, ResumeSectionMode>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  function openModal() {
    // Reset recommended selection in case resumes changed
    const rec = resumes.find((r) => r.name === recommendedResume);
    setSelectedId(rec?.id ?? resumes[0]?.id ?? "");
    setStatus("idle");
    setError("");
    setOpen(true);
  }

  async function generate() {
    if (!selectedId) return;
    setStatus("generating");
    setError("");
    try {
      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, resumeId: selectedId, sectionModes: buildSectionModes() }),
      });
      const data = (await res.json()) as { documentId?: string; error?: string };
      if (!res.ok || !data.documentId) throw new Error(data.error ?? "Generation failed");
      router.push(`/generated-documents/${data.documentId}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  if (resumes.length === 0) return null;

  const selectedVersion = selectedId ? resumeVersions[selectedId] : undefined;
  const selectedApproved = selectedVersion?.status === "approved";

  function defaultModeFor(section: ResumeBuilderSection): ResumeSectionMode {
    if (sectionModes[section.id]) return sectionModes[section.id];
    if (section.type === "summary" || section.type === "impact" || section.type === "experience") return "update";
    return "keep";
  }

  function buildSectionModes(): ResumeSectionModeInput[] {
    return (selectedVersion?.sections ?? []).map((section) => ({
      sectionId: section.id,
      mode: defaultModeFor(section)
    }));
  }

  return (
    <>
      <Button onClick={openModal} variant="secondary">
        {hasExistingDocument ? "Regenerate resume" : "Generate tailored resume"}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && status !== "generating") setOpen(false);
          }}
        >
          <div ref={dialogRef} className="w-full max-w-md rounded-2xl bg-panel shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
              <h2 className="text-sm font-semibold text-ink">Select base resume</h2>
              {status !== "generating" && (
                <button
                  aria-label="Close"
                  className="text-muted transition-colors hover:text-ink"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {status === "generating" ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  <p className="text-sm text-ink">Building tailored resume…</p>
                  <p className="text-xs text-muted">This may take 15–30 seconds with AI.</p>
                </div>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted">
                    Choose which of your uploaded resumes to use as the starting point. The
                    recommended one is pre-selected based on the job evaluation.
                  </p>

                  <ul className="grid gap-2">
                    {resumes.map((resume) => {
                      const isRec = resume.name === recommendedResume;
                      const checked = selectedId === resume.id;
                      return (
                        <li key={resume.id}>
                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                              checked
                                ? "border-accent bg-accent/5"
                                : "border-border bg-surface hover:border-accent/40"
                            }`}
                          >
                            <input
                              checked={checked}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--color-accent))]"
                              name="resume"
                              onChange={() => setSelectedId(resume.id)}
                              type="radio"
                              value={resume.id}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-ink">{resume.name}</span>
                                {isRec && (
                                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                                    Recommended
                                  </span>
                                )}
                              </div>
	                              <p className="mt-0.5 text-xs text-muted">
	                                {resume.wordCount > 0 ? `${resume.wordCount} words` : "Uploaded resume"}
	                                {resume.activeStatus ? "" : " · Inactive"}
	                                {resumeVersions[resume.id]?.status === "approved" ? " · Approved" : " · Needs builder review"}
	                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
	                  </ul>

	                  {selectedVersion && selectedApproved ? (
	                    <div className="mt-5 rounded-lg border border-border bg-surface p-3">
	                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Sections for this resume</p>
	                      <div className="grid gap-2">
	                        {selectedVersion.sections.map((section) => (
	                          <label className="grid gap-1 text-xs text-muted sm:grid-cols-[1fr_8rem]" key={section.id}>
	                            <span className="min-w-0 truncate text-ink">{section.title}</span>
	                            <select
	                              className="rounded-control border border-border bg-panel px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
	                              disabled={section.type === "header"}
	                              onChange={(event) => setSectionModes((prev) => ({ ...prev, [section.id]: event.target.value as ResumeSectionMode }))}
	                              value={section.type === "header" ? "keep" : defaultModeFor(section)}
	                            >
	                              <option value="keep">Keep</option>
	                              <option value="update">AI update</option>
	                              <option value="hide">Hide</option>
	                            </select>
	                          </label>
	                        ))}
	                      </div>
	                    </div>
	                  ) : selectedId ? (
	                    <p className="mt-4 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm text-warning">
	                      Review and approve this resume lane in Profile before generating from it.
	                    </p>
	                  ) : null}

	                  {status === "error" && (
                    <p className="mt-3 text-sm text-danger">{error}</p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {status !== "generating" && (
              <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                <Button onClick={() => setOpen(false)} variant="quiet">
                  Cancel
                </Button>
	                <Button disabled={!selectedId || !selectedApproved} onClick={generate}>
	                  Generate
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
