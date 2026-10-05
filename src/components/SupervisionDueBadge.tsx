import { Badge } from "@/components/ui/badge";

// Markierung für Fälle mit mehr offenen Sitzungen, als das Soll-Verhältnis ohne Supervision zulässt (im Standard ab
// der fünften Sitzung) – Fallauswahl, Dashboard, Liste.
export function SupervisionDueBadge() {
  return <Badge variant="warning-soft">SV fällig</Badge>;
}
