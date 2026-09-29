import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";
import { format, isValid } from "date-fns";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { SentimentBadge } from "@/components/feedback/sentiment";
import type { FeedbackMeta } from "@/lib/feedback/model";

// Eine beschädigte created_at-Zeile darf Liste und Detailseite nicht abstürzen lassen: dann den Rohwert zeigen.
export function formatFeedbackTime(iso: string): string {
  const date = new Date(iso);
  return isValid(date) ? format(date, "dd.MM.yyyy, HH:mm") : iso || "–";
}

// Neueste zuerst (Reihenfolge kommt aus dem Store). Jede Zeile ist ein Link zur Detailseite.
export function FeedbackList({ items }: { items: FeedbackMeta[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Feedback" backHref="/admin" backLabel="Zur Administration" subtitle={`${items.length} Einträge`} />
      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">Noch kein Feedback.</p>
        </Card>
      ) : (
        <Card className="gap-0 divide-y divide-border py-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/admin/feedback/${item.id}`}
              className="-mx-4 flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  <SentimentBadge sentiment={item.sentiment} />
                  <span className="truncate">{item.element}</span>
                  {item.screenshot && <Camera className="size-4 text-muted-foreground" aria-label="mit Screenshot" />}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{item.page}</p>
                <p className="text-xs text-muted-foreground">
                  {item.userName || "ohne Namen"} · {item.userEmail} · {formatFeedbackTime(item.createdAt)}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
