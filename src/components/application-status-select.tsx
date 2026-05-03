"use client";

import { useRef } from "react";
import { applicationStatuses, isApplicationStatus } from "@/lib/applications/status";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  currentStatus: string;
};

export function ApplicationStatusSelect({ action, currentStatus }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const isKnown = isApplicationStatus(currentStatus);

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
        {applicationStatuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
