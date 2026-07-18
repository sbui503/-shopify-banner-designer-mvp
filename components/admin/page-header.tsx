import { Badge } from "@/components/ui/badge";

export function PageHeader({
  title,
  description,
  badge
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2">
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
        </div>
        <h1 className="text-2xl font-black tracking-normal text-slate-950 md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
