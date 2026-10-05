import Link from "next/link";
import { BookOpen } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import RatioIndicator from "@/components/RatioIndicator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { hoursRemaining, supervisionHoursMissingForRatio, type RatioResult } from "@/lib/calculations";
import type { Ausbildungsregeln } from "@/lib/ausbildungsregeln/model";
import { formatDecimal } from "@/lib/csv";
import { countNoun, formatVerhaeltnis } from "@/lib/format";
import { SUPERVISION_SETTING_LABELS, SUPERVISION_SETTING_ORDER } from "@/lib/labels";
import type { SupervisionSetting } from "@/types";

interface SupervisionStatusCardProps {
  therapyHours: number;
  supervisionHours: number;
  ratio: RatioResult;
  regeln: Ausbildungsregeln;
  unsupervisedCount: number;
  bySetting: Record<SupervisionSetting, number>;
}

// Ohne Behandlungsstunden meldet calculateRatio „kritisch“, es fehlt aber keine Supervision – deshalb zuerst dieser Fall,
// damit nie „0,0 SV-Einheiten fehlen“ oder „passt“ neben einem roten Indikator steht.
function ratioHint(therapyHours: number, missingHours: number, soll: string): string {
  if (therapyHours === 0) return "Noch keine Behandlungsstunden erfasst.";
  if (missingHours > 0) return `Für 1:${soll} fehlen jetzt ${formatDecimal(missingHours, 1)} SV-Einheiten.`;
  return `Verhältnis passt – im Soll von 1:${soll}.`;
}

// „Wie viel Supervision habe ich, wie viel fehlt, passt das Verhältnis?“ – Stand (getrennt nach Einzel und Gruppe),
// Rest bis zum Ziel, Verhältnis mit konkretem Bedarf und die offene Supervision (Sitzungen ohne Zuordnung) mit Sprung
// in die Erfassung. Ziel und Soll kommen aus dem Regelwerk (#8).
export function SupervisionStatusCard({ therapyHours, supervisionHours, ratio, regeln, unsupervisedCount, bySetting }: SupervisionStatusCardProps) {
  const missing = supervisionHoursMissingForRatio(therapyHours, supervisionHours, regeln);
  const target = regeln.svEinheitenZiel;
  return (
    <Card role="region" aria-label="Supervision">
      <SectionHeader>Supervision</SectionHeader>
      <ProgressBar current={supervisionHours} target={target} label="SV-Einheiten" color="green" />
      <p className="text-sm text-muted-foreground">
        Noch{" "}
        <span className="font-semibold text-foreground">{formatDecimal(hoursRemaining(supervisionHours, target), 1)} SV-Einheiten</span>{" "}
        bis {target}
      </p>
      {supervisionHours > 0 && (
        <p className="text-sm text-muted-foreground">
          {SUPERVISION_SETTING_ORDER.map((s, i) => (
            <span key={s}>
              {i > 0 && " · "}
              {SUPERVISION_SETTING_LABELS[s]} {formatDecimal(bySetting[s], 1)} ({Math.round((bySetting[s] / supervisionHours) * 100)} %)
            </span>
          ))}
        </p>
      )}
      <RatioIndicator ratio={ratio} />
      <p className="text-sm font-medium text-foreground">{ratioHint(therapyHours, missing, formatVerhaeltnis(regeln.verhaeltnisWarnung))}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Offene Supervision:{" "}
          <span className="font-semibold text-foreground">
            {countNoun(unsupervisedCount, "Sitzung", "Sitzungen")}
          </span>{" "}
          noch nicht besprochen
        </p>
        <Button asChild variant="outline" size="sm" className="h-auto min-h-11 max-w-full whitespace-normal md:min-h-9">
          <Link href="/sessions/new?type=supervision">
            <BookOpen />
            Supervision erfassen
          </Link>
        </Button>
      </div>
    </Card>
  );
}
