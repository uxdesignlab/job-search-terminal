import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "quiet";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-accent bg-accent text-white hover:bg-[rgb(var(--color-accent-strong))]",
  secondary: "border-border bg-panel text-ink hover:border-accent",
  quiet: "border-transparent bg-transparent text-ink hover:bg-panel"
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-control border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        className
      )}
      type={type}
      {...props}
    />
  );
}
