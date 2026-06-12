"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Modal } from "./ui/modal";
import { Textarea } from "./ui/textarea";
import { addManualJobAction } from "@/app/jobs/actions";

export function AddJobModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError("");
    try {
      const result = await addManualJobAction(formData);
      if (result.success) {
        setIsOpen(false);
        router.push(`/jobs/${result.jobId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add job");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Add Job</Button>
      <Modal
        open={isOpen}
        onClose={!isPending ? () => setIsOpen(false) : undefined}
        title="Add Job Manually"
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
              placeholder="e.g. Acme Corp"
              required
              disabled={isPending}
            />
            <Input
              label="Job Title"
              name="title"
              placeholder="e.g. Senior UX Designer"
              required
              disabled={isPending}
            />
          </div>
          <Input
            label="Job URL"
            name="url"
            type="url"
            placeholder="https://..."
            required
            disabled={isPending}
          />
          <Textarea
            label="Job Description"
            name="description"
            placeholder="Paste the full job description here..."
            required
            className="min-h-[200px]"
            disabled={isPending}
          />
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
              {isPending ? "Analyzing & Generating Resume..." : "Submit Job"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
