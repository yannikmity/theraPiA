import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { getFeedbackStore } from "@/lib/feedback";
import { isFeedbackId } from "@/lib/feedback/model";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { SentimentBadge } from "@/components/feedback/sentiment";
import { formatFeedbackTime } from "../FeedbackList";

export const dynamic = "force-dynamic";

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all text-foreground" : "break-words text-foreground"}>{value || "–"}</dd>
    </div>
  );
}

export default async function AdminFeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/");
  const { id } = await params;
  if (!isFeedbackId(id)) notFound();
  const item = await getFeedbackStore().get(id);
  if (!item) notFound();
  const { meta, text } = item;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={meta.element}
        backHref="/admin/feedback"
        backLabel="Zur Feedback-Liste"
        subtitle={`${meta.userName || "ohne Namen"} · ${meta.userEmail} · ${formatFeedbackTime(meta.createdAt)}`}
        actions={<SentimentBadge sentiment={meta.sentiment} />}
      />
      <Card>
        <p className="text-sm whitespace-pre-wrap text-foreground">{text}</p>
      </Card>
      <Card>
        <dl className="space-y-2">
          <Row label="Seite" value={meta.page} mono />
          <Row label="Element" value={meta.element} />
          <Row label="Selector" value={meta.selector} mono />
          <Row label="Viewport" value={meta.viewport} />
          <Row label="Browser" value={meta.userAgent} />
          <Row label="ID" value={meta.id} mono />
        </dl>
      </Card>
      {meta.screenshot && (
        <Card>
          {/* eslint-disable-next-line @next/next/no-img-element -- Admin-only-Route; der Bild-Optimierer hätte kein Cookie */}
          <img src={`/api/feedback/${meta.id}/screenshot`} alt={`Screenshot zu „${meta.element}“`} className="w-full rounded-lg border border-border" />
        </Card>
      )}
    </div>
  );
}
