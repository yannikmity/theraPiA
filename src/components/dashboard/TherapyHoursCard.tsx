import ProgressBar from "@/components/ProgressBar";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { hoursRemaining } from "@/lib/calculations";
import { formatDecimal } from "@/lib/csv";
import { CATEGORY_LABELS, sichtbareKategorien } from "@/lib/labels";
import type { SessionCategory } from "@/types";

interface TherapyHoursCardProps {
  hours: number;
  target: number; // Ziel aus dem Regelwerk (#8)
  categoryHours: Record<SessionCategory, number>;
}

// „Wie viele Behandlungsstunden habe ich, wie viele fehlen noch?“ – Stand, Rest bis zum Ziel und die Stunden je Kategorie.
export function TherapyHoursCard({ hours, target, categoryHours }: TherapyHoursCardProps) {
  // Mehr als drei Kategorien brechen im grid-cols-3 in eine zweite Zeile um.
  const categories = sichtbareKategorien(categoryHours);
  return (
    <Card role="region" aria-label="Behandlungsstunden">
      <SectionHeader>Behandlungsstunden</SectionHeader>
      <ProgressBar current={hours} target={target} label="Behandlungsstunden" color="blue" />
      <p className="text-sm text-muted-foreground">
        Noch <span className="font-semibold text-foreground">{formatDecimal(hoursRemaining(hours, target), 1)} Behandlungsstunden</span>{" "}
        bis {target}
      </p>
      <div className="grid grid-cols-3 gap-3 text-center">
        {categories.map((category) => (
          <div key={category} className="min-w-0">
            <p className="text-lg font-bold text-foreground">{formatDecimal(categoryHours[category], 1)}</p>
            <p className="mt-0.5 hyphens-auto text-xs wrap-anywhere text-muted-foreground">{CATEGORY_LABELS[category]}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
