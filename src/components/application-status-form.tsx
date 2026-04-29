"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

type ApplicationStatusFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  status: string;
  variant?: "primary" | "secondary" | "quiet";
};

export function ApplicationStatusForm({ action, label, status, variant = "secondary" }: ApplicationStatusFormProps) {
  return (
    <form action={action}>
      <input name="status" type="hidden" value={status} />
      <SubmitButton label={label} variant={variant} />
    </form>
  );
}

function SubmitButton({ label, variant }: { label: string; variant: "primary" | "secondary" | "quiet" }) {
  const { pending } = useFormStatus();

  return (
    <Button aria-live="polite" disabled={pending} type="submit" variant={variant}>
      {pending ? "Saving..." : label}
    </Button>
  );
}

