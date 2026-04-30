"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { addManualJobAction } from "@/app/jobs/actions";

export function AddJobModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        Add Job
      </Button>
    );
  }

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
      
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-6 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-2xl bg-panel p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink">Add Job Manually</h2>
            <button
              className="text-muted hover:text-ink focus:outline-none"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-danger/10 p-4 text-sm text-danger">
              {error}
            </div>
          )}

          <form action={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-2">
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

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
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
        </div>
      </div>
    </>
  );
}
