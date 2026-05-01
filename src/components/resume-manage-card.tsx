"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  name: string;
  wordCount: number;
  evidence: string[];
};

export function ResumeManageCard({ id, name, wordCount, evidence }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(name);
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const [currentWords, setCurrentWords] = useState(wordCount);

  const inputCls = "w-full rounded-control border border-border bg-surface px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent";

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
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/resume/${id}/upload`, { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; wordCount?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Upload failed");
      setCurrentWords(data.wordCount ?? currentWords);
      setUploadStatus("done");
      router.refresh();
      setTimeout(() => setUploadStatus("idle"), 3000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setUploadStatus("error");
    }
  }

  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editing ? (
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <input
              autoFocus
              className={inputCls}
              onBlur={saveName}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditing(false); setNameValue(name); } }}
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
            <p className="truncate text-sm font-medium text-ink">{nameValue}</p>
            <button
              className="shrink-0 text-xs text-muted hover:text-ink"
              onClick={() => setEditing(true)}
              title="Rename"
              type="button"
            >
              ✎
            </button>
            {nameStatus === "saved" && <span className="text-xs text-success">Saved</span>}
            {nameStatus === "error" && <span className="text-xs text-danger">Error</span>}
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${currentWords > 0 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
            {currentWords} words
          </span>
          <button
            className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
            disabled={uploadStatus === "uploading"}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            {uploadStatus === "uploading" ? "Uploading…" : uploadStatus === "done" ? "✓ Uploaded" : "Re-upload PDF"}
          </button>
          <input
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
            ref={fileRef}
            type="file"
          />
        </div>
      </div>

      {uploadStatus === "error" && (
        <p className="mt-1 text-xs text-danger">{uploadError}</p>
      )}
      {uploadStatus === "done" && (
        <p className="mt-1 text-xs text-success">PDF replaced and text re-extracted.</p>
      )}

      {evidence.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-muted">
          {evidence.slice(0, 2).join(" ")}
        </p>
      )}
    </div>
  );
}
