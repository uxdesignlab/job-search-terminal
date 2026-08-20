import { Card, CardHeader, CardTitle } from "@/components/ui";

export function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function EvaluationSection({ title, items }: { title: string; items: string[] }) {
  return <DetailList title={title} items={items.length > 0 ? items : ["No data captured."]} />;
}
