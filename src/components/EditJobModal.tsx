"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Modal } from "./ui/modal";
import { Textarea } from "./ui/textarea";
import { editJobAction } from "@/app/jobs/actions";

type Props = {
  jobId: string;
  defaultTitle: string;
  defaultCompany: string;
  defaultUrl: string;
  defaultDescription: string;
};

export function EditJobModal({ jobId, defaultTitle, defaultCompany, defaultUrl, defaultDescription }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError("");
    try {
      await editJobAction(jobId, formData);
      setIsOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Edit job details
      </Button>
      <Modal
        open={isOpen}
        onClose={!isPending ? () => setIsOpen(false) : undefined}
        title="Edit Job Details"
        size="lg"
      >
        <form action={handleSubmit} className="grid gap-4 p-5">
          {error && (
            <div className="rounded-md bg-danger/10 p-4 text-sm text-danger">{error}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Company"
              name="company"
              defaultValue={defaultCompany}
              placeholder="e.g. Acme Corp"
              disabled={isPending}
            />
            <Input
              label="Job Title"
              name="title"
              defaultValue={defaultTitle}
              placeholder="e.g. Senior UX Designer"
              disabled={isPending}
            />
          </div>
          <Input
            label="Job URL"
            name="url"
            type="url"
            defaultValue={defaultUrl}
            placeholder="https://..."
            disabled={isPending}
          />
          <Textarea
            label="Job Description"
            name="description"
            defaultValue={defaultDescription}
            placeholder="Paste the full job description here..."
            className="min-h-[200px]"
            disabled={isPending}
          />
          <p className="text-xs text-muted">
            Re-run evaluation after updating the description to refresh the AI analysis.
          </p>
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
