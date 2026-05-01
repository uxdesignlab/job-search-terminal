import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "quiet";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  external?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-accent bg-accent text-white hover:bg-[rgb(var(--color-accent-strong))]",
  secondary: "border-border bg-panel text-ink hover:border-accent",
  quiet: "border-transparent bg-transparent text-ink hover:bg-panel"
};

const buttonBase = "inline-flex min-h-11 items-center justify-center rounded-control border px-4 py-2 text-sm font-medium transition-colors";

export function Button({ className, variant = "primary", type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonBase, "disabled:cursor-not-allowed disabled:opacity-55", variants[variant], className)}
      type={type}
      {...props}
    />
  );
}

export function LinkButton({ className, variant = "secondary", ...props }: LinkButtonProps) {
  return <Link className={cn(buttonBase, variants[variant], className)} {...props} />;
}

export function ExternalLinkButton({
  className,
  variant = "secondary",
  href,
  children,
  ...props
}: Omit<ComponentProps<"a">, "href"> & { href: string; variant?: ButtonVariant }) {
  return (
    <a
      className={cn(buttonBase, variants[variant], className)}
      href={href}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  );
}
