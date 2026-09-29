import type { LucideIcon } from "lucide-react";
import { Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SENTIMENT_LABELS, type Sentiment } from "@/lib/feedback/model";

// Darstellung der drei Sentiments – Widget und Admin-Seiten nutzen dieselben Icons und Farben.
export const SENTIMENT_ICONS: Record<Sentiment, LucideIcon> = {
  positiv: ThumbsUp,
  negativ: ThumbsDown,
  wunsch: Lightbulb,
};

const BADGE_VARIANT: Record<Sentiment, "success-soft" | "destructive-soft" | "warning-soft"> = {
  positiv: "success-soft",
  negativ: "destructive-soft",
  wunsch: "warning-soft",
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const Icon = SENTIMENT_ICONS[sentiment];
  return (
    <Badge variant={BADGE_VARIANT[sentiment]}>
      <Icon aria-hidden="true" /> {SENTIMENT_LABELS[sentiment]}
    </Badge>
  );
}
