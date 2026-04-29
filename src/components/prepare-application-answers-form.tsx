"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

type PrepareApplicationAnswersFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  label?: string;
  variant?: "primary" | "secondary" | "quiet";
};

export function PrepareApplicationAnswersForm({ action, label = "Prepare answers", variant = "primary" }: PrepareApplicationAnswersFormProps) {
  return (
    <form action={action}>
      <SubmitButton label={label} variant={variant} />
    </form>
  );
}

function SubmitButton({ label, variant }: { label: string; variant: "primary" | "secondary" | "quiet" }) {
  const { pending } = useFormStatus();

  return (
    <Button aria-live="polite" disabled={pending} type="submit" variant={variant}>
      {pending ? "Preparing..." : label}
    </Button>
  );
}

