"use client";

import { useRef } from "react";

const STATUS_OPTIONS = [
  "Applied",
  "Follow-up needed",
  "Recruiter responded",
  "Interviewing",
  "Offer",
  "Rejected",
  "Skipped",
] as const;

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  currentStatus: string;
};

export function ApplicationStatusSelect({ action, currentStatus }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const isKnown = (STATUS_OPTIONS as readonly string[]).includes(currentStatus);

  return (
    <form ref={formRef} action={action}>
      <select
        className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        defaultValue={currentStatus}
        name="status"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {!isKnown && (
          <option disabled value={currentStatus}>
            {currentStatus}
          </option>
        )}
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
