"use client";

import { useActionState } from "react";

/**
 * What the fetch attempt did. `idle` is the state before anything has been tried;
 * the rest mirror `FetchDescriptionOutcome` in the fetcher.
 */
export type FetchDescriptionState = {
  status: "idle" | "fetched" | "unsupported" | "empty" | "unreachable";
};

const MESSAGES: Record<Exclude<FetchDescriptionState["status"], "idle" | "fetched">, string> = {
  unsupported: "This posting is not on a job board the app can read. Paste the description under Edit job details.",
  empty: "The job board answered, but had no description for this posting. Paste it under Edit job details.",
  unreachable: "Could not reach the job board just now. Try again in a moment.",
};

/**
 * Reports what the fetch actually did. The shared SubmitButton says "Saved ✓" whenever
 * a form action finishes, which on this form meant a fetch that returned nothing still
 * looked like a save — the card below it went on saying the description was missing.
 */
export function FetchDescriptionButton({
  action,
}: {
  action: () => Promise<FetchDescriptionState>;
}) {
  const [state, formAction, pending] = useActionState<FetchDescriptionState>(
    async () => action(),
    { status: "idle" },
  );
  const message = state.status in MESSAGES ? MESSAGES[state.status as keyof typeof MESSAGES] : null;

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <button
        aria-busy={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? "Fetching…" : "Fetch description"}
      </button>
      {message ? (
        <p className="max-w-xs text-right text-xs leading-5 text-danger" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
