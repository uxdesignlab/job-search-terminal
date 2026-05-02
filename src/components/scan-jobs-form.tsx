"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

type ScanJobsFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  label?: string;
  pendingLabel?: string;
};

export function ScanJobsForm({ action, label = "Scan for new jobs", pendingLabel = "Scanning..." }: ScanJobsFormProps) {
  return (
    <form action={action}>
      <ScanButton label={label} pendingLabel={pendingLabel} />
    </form>
  );
}

function ScanButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button aria-live="polite" disabled={pending} type="submit">
      {pending ? pendingLabel : label}
    </Button>
  );
}
