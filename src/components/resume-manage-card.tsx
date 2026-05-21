"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import type { ResumeBuilderVersionStatus } from "@/lib/db/types";

type Props = {
  id: string;
  name: string;
  wordCount: number;
  evidence: string[];
  initialUploadOnly?: boolean;
  builderStatus?: ResumeBuilderVersionStatus;
};

const inputCls =
  "w-full rounded-control border border-border bg-surface px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent";

export function ResumeManageCard({ id, name, wordCount, evidence, initialUploadOnly = false, builderStatus }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Name editing
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(name);
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Upload
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [currentWords, setCurrentWords] = useState(wordCount);

  // Remove
  const [removeStatus, setRemoveStatus] = useState<"idle" | "removing" | "error">("idle");
  const [showConfirm, setShowConfirm] = useState(false);

  async function saveName() {
    if (!nameValue.trim() || nameValue.trim() === name) {
      setEditing(false);
      setNameValue(name);
      return;
    }
    setNameStatus("saving");
    try {
      const res = await fetch(`/api/resume/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      if (!res.ok) throw new Error("Save failed");
      setNameStatus("saved");
      setEditing(false);
      router.refresh();
      setTimeout(() => setNameStatus("idle"), 2000);
    } catch {
      setNameStatus("error");
    }
  }

  async function uploadFile(file: File) {
    setUploadStatus("uploading");
    setUploadError("");
    setUploadWarnings([]);
    setShowConfirm(false);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/resume/${id}/upload`, { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; wordCount?: number; error?: string; warnings?: string[] };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Upload failed");
      setCurrentWords(data.wordCount ?? currentWords);
      setUploadWarnings(data.warnings ?? []);
      setUploadStatus("done");
      router.refresh();
      setTimeout(() => setUploadStatus("idle"), 3000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setUploadStatus("error");
    }
  }

  async function removeFile() {
    setRemoveStatus("removing");
    setShowConfirm(false);
    try {
      const res = await fetch(`/api/resume/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Remove failed");
      router.refresh();
    } catch {
      setRemoveStatus("error");
    }
  }

  const hasFile = currentWords > 0;
  const hasBuilderContent = !!builderStatus && builderStatus !== "missing_source";
  const builderTone = builderStatus === "approved" ? "success" : builderStatus === "missing_source" ? "danger" : "warning";
  const builderLabel = builderStatus === "approved" ? "Approved" : builderStatus === "missing_source" ? "Missing readable data" : "Needs review";

  const uploadButton = (
    <button
      className="inline-flex items-center gap-1.5 rounded-control border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={uploadStatus === "uploading"}
      onClick={() => fileRef.current?.click()}
      type="button"
    >
      {uploadStatus === "uploading" ? (
        <>
          <svg aria-hidden="true" className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
          </svg>
          Uploading…
        </>
      ) : (
        <>
          <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Upload resume
        </>
      )}
    </button>
  );

  if (initialUploadOnly) {
    return (
      <div>
        {uploadButton}
        <input
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
          ref={fileRef}
          type="file"
        />
        {uploadStatus === "error" && (
          <p className="mt-2 text-xs text-danger">{uploadError}</p>
        )}
        {uploadStatus === "done" && uploadWarnings.length === 0 && (
          <p className="mt-2 text-xs text-success">PDF uploaded and text extracted — {currentWords} words.</p>
        )}
        {uploadStatus === "done" && uploadWarnings.length > 0 && (
          <p className="mt-2 text-xs text-warning">
            Uploaded ({currentWords} words). Some sections could not be detected: {uploadWarnings.join("; ")}.
            You can add them manually in the resume builder.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-control border border-border bg-surface p-4">
      {/* Header row: name + status badge */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editing ? (
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <input
              autoFocus
              className={inputCls}
              onBlur={saveName}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") { setEditing(false); setNameValue(name); }
              }}
              value={nameValue}
            />
            <button
              className="shrink-0 text-xs font-medium text-accent hover:underline"
              onClick={saveName}
              type="button"
            >
              {nameStatus === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{nameValue}</p>
            <button
              className="shrink-0 text-xs text-muted hover:text-ink"
              onClick={() => setEditing(true)}
              title="Rename resume"
              type="button"
            >
              ✎
            </button>
            {nameStatus === "saved" && <span className="text-xs text-success">Saved</span>}
            {nameStatus === "error" && <span className="text-xs text-danger">Error</span>}
          </div>
        )}

        {/* Word count / source badge */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            hasFile
              ? "bg-success/10 text-success"
              : hasBuilderContent
              ? "bg-accent/10 text-accent"
              : "bg-muted/10 text-muted"
          }`}
        >
          {hasFile ? `${currentWords} words` : hasBuilderContent ? "Built from scratch" : "Not uploaded"}
        </span>
        {(hasFile || hasBuilderContent) && builderStatus && (
          <Badge tone={builderTone}>{builderLabel}</Badge>
        )}
      </div>

      {/* Evidence preview */}
      {hasFile && evidence.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-muted line-clamp-2">
          {evidence.slice(0, 2).join(" ")}
        </p>
      )}

      {/* Actions row */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* Upload/replace PDF — prominent if no content, secondary otherwise */}
        {!hasFile && !hasBuilderContent ? (
          uploadButton
        ) : (
          <button
            className="inline-flex items-center gap-1.5 rounded-control border border-accent/60 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={uploadStatus === "uploading" || removeStatus === "removing"}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            {uploadStatus === "uploading" ? (
              <>
                <svg aria-hidden="true" className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
                </svg>
                Uploading…
              </>
            ) : uploadStatus === "done" ? (
              "✓ Uploaded"
            ) : (
              <>
                <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {hasFile ? "Replace PDF" : "Upload PDF"}
              </>
            )}
          </button>
        )}

        {/* Builder link — always shown for all resumes */}
        <Link
          className="text-xs font-medium text-accent hover:underline"
          href={`/profile/resumes/${id}/builder`}
        >
          {builderStatus === "approved" ? "Edit approved version" : "Edit resume"}
        </Link>

        {/* Remove lane — always shown */}
        {!showConfirm ? (
          <button
            className="text-xs font-medium text-muted hover:text-danger hover:underline disabled:opacity-50"
            disabled={removeStatus === "removing"}
            onClick={() => setShowConfirm(true)}
            type="button"
          >
            {removeStatus === "removing" ? "Removing…" : "Remove"}
          </button>
        ) : (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-muted">Remove this resume?</span>
            <button
              className="font-semibold text-danger hover:underline"
              onClick={removeFile}
              type="button"
            >
              Yes, remove
            </button>
            <button
              className="text-muted hover:text-ink hover:underline"
              onClick={() => setShowConfirm(false)}
              type="button"
            >
              Cancel
            </button>
          </span>
        )}

        {removeStatus === "error" && (
          <span className="text-xs text-danger">Remove failed</span>
        )}

        <input
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
          ref={fileRef}
          type="file"
        />
      </div>

      {uploadStatus === "error" && (
        <p className="mt-2 text-xs text-danger">{uploadError}</p>
      )}
      {uploadStatus === "done" && uploadWarnings.length === 0 && (
        <p className="mt-2 text-xs text-success">PDF uploaded and text extracted — {currentWords} words.</p>
      )}
      {uploadStatus === "done" && uploadWarnings.length > 0 && (
        <p className="mt-2 text-xs text-warning">
          Uploaded ({currentWords} words). Some sections could not be detected: {uploadWarnings.join("; ")}.
          You can add them manually in the resume builder.
        </p>
      )}
    </div>
  );
}
