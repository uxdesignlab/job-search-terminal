"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  compact?: boolean;
};

export function CreateResumeButton({ compact = false }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "creating" | "error">("idle");
  const [error, setError] = useState("");

  async function handleCreate() {
    setStatus("creating");
    setError("");
    try {
      const res = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Resume" }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !data.ok || !data.id) throw new Error(data.error ?? "Failed to create resume");
      router.push(`/profile/resumes/${data.id}/builder?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const buttonCls = compact
    ? "inline-flex items-center gap-1.5 rounded-control border border-accent bg-accent px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-55"
    : "inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-55";

  const iconCls = compact ? "h-3 w-3" : "h-4 w-4";
  const spinnerCls = compact ? `${iconCls} animate-spin` : `${iconCls} animate-spin`;

  return (
    <div>
      <button
        className={buttonCls}
        disabled={status === "creating"}
        onClick={handleCreate}
        type="button"
      >
        {status === "creating" ? (
          <>
            <svg aria-hidden="true" className={`${spinnerCls} ${compact ? "" : "mr-2"}`} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
            </svg>
            Creating…
          </>
        ) : (
          <>
            <svg aria-hidden="true" className={`${iconCls} ${compact ? "" : "mr-2"}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Create new resume
          </>
        )}
      </button>
      {status === "error" && (
        <p className="mt-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
