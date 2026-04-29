"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

type ScanJobsFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function ScanJobsForm({ action }: ScanJobsFormProps) {
  return (
    <form action={action}>
      <ScanButton />
    </form>
  );
}

function ScanButton() {
  const { pending } = useFormStatus();

  return (
    <Button aria-live="polite" disabled={pending} type="submit">
      {pending ? "Scanning..." : "Scan for new jobs"}
    </Button>
  );
}
