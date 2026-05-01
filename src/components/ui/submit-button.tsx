"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type SubmitButtonProps = {
  label?: string;
  pendingLabel?: string;
  savedLabel?: string;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
};

const variants = {
  primary: "border-accent bg-accent text-white hover:bg-[rgb(var(--color-accent-strong))]",
  secondary: "border-border bg-panel text-ink hover:border-accent",
  quiet: "border-transparent bg-transparent text-ink hover:bg-panel"
};

export function SubmitButton({
  label = "Save",
  pendingLabel = "Saving…",
  savedLabel = "Saved",
  variant = "primary",
  className
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const [wasPending, setWasPending] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (pending) {
      setWasPending(true);
    } else if (wasPending) {
      setWasPending(false);
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [pending, wasPending]);

  return (
    <button
      aria-busy={pending}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-control border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        showSaved && variant === "primary" && "border-success bg-success/10 text-success",
        className
      )}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : showSaved ? savedLabel : label}
    </button>
  );
}
