"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { reopenOnboardingAction } from "@/app/dashboard/onboarding-actions";

/**
 * Reopens the first-run wizard. Dismissing setup used to be a one-way door — nothing in
 * the app cleared `onboardingDismissed`, so a user who dismissed it early could only get
 * the guided flow back as a side effect of re-uploading a resume.
 */
export function ResumeOnboardingButton({ label = "Resume guided setup" }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await reopenOnboardingAction();
          router.refresh();
        })
      }
      type="button"
      variant="primary"
    >
      {isPending ? "Opening…" : label}
    </Button>
  );
}
