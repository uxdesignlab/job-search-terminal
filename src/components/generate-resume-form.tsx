"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

type GenerateResumeFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function GenerateResumeForm({ action }: GenerateResumeFormProps) {
  return (
    <form action={action}>
      <GenerateButton />
    </form>
  );
}

function GenerateButton() {
  const { pending } = useFormStatus();

  return (
    <Button aria-live="polite" disabled={pending} type="submit">
      {pending ? "Generating..." : "Generate tailored resume"}
    </Button>
  );
}
