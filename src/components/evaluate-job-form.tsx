"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

type EvaluateJobFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function EvaluateJobForm({ action }: EvaluateJobFormProps) {
  return (
    <form action={action}>
      <EvaluateButton />
    </form>
  );
}

function EvaluateButton() {
  const { pending } = useFormStatus();

  return (
    <Button aria-live="polite" disabled={pending} type="submit">
      {pending ? "Evaluating..." : "Evaluate job"}
    </Button>
  );
}
