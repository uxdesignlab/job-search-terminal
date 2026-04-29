import type { ReactNode } from "react";
import { Badge } from "./badge";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl space-y-3">
        {eyebrow ? <Badge>{eyebrow}</Badge> : null}
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-normal text-ink">{title}</h2>
          <p className="text-base leading-7 text-muted">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
