"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applicationStatuses, isApplicationStatus } from "@/lib/applications/status";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  currentStatus: string;
};

export function ApplicationStatusSelect({ action, currentStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const isKnown = isApplicationStatus(currentStatus);

  return (
    <select
      className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isPending}
      name="status"
      value={selectedStatus}
      onChange={(event) => {
        const nextStatus = event.target.value;
        const previousStatus = selectedStatus;
        setSelectedStatus(nextStatus);
        startTransition(async () => {
          try {
            const formData = new FormData();
            formData.set("status", nextStatus);
            await action(formData);
            router.refresh();
          } catch {
            setSelectedStatus(previousStatus);
          }
        });
      }}
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
  );
}
