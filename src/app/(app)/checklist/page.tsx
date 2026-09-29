import { Lightbulb, Square } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireSession } from "@/lib/require-session";

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "Vor dem Start",
    items: [
      "Behandlungsvertrag-Vorlage vom Institut besorgen",
      "Absagefrist-Regelung klären (48h empfohlen)",
      "Warteliste beim Institut erfragen",
      "Supervisor:in festlegen (Gruppe + Einzel)",
      "4er-Gruppensupervision organisieren (günstigste Option!)",
      "Dokumentationsvorlage einrichten",
      "Grunddaten in der App prüfen",
      "Steuernummer / Steuerberater klären",
    ],
  },
  {
    title: "Wöchentliche Routine",
    items: [
      "Freitags: Behandlungsstunden + Ausfälle in der App eintragen",
      "Nach jeder Supervision: direkt in der App eintragen",
      "Dashboard checken: Fortschritt & Zeitbudget prüfen",
    ],
  },
  {
    title: "Quartals-Routine",
    items: [
      "Quartalsübersicht prüfen: Einnahmen vs. Supervision",
      "Nächstes Quartal planen: Patient:innen, Supervision, Ferien einrechnen",
      "Supervisionskosten mit Budget abgleichen",
      "Wenn nötig: Behandlungsstunden-Pace anpassen",
    ],
  },
];

const TIPS = [
  "4er-Gruppe statt 2er spart ~2.800€ an Supervisionskosten",
  "Fahrtkosten zum Institut / zur Supervision sind absetzbar",
  "Supervisionskosten = Werbungskosten / Ausbildungskosten",
  "NV-Bescheinigung beim Finanzamt beantragen (bei geringem Einkommen)",
  "Frühzeitig Patient:innen aufnehmen – Wartezeiten in KJP sind lang",
  "Anträge zügig schreiben – offene Anträge blockieren neue Patient:innen",
];

export default async function ChecklistPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Checkliste & Tipps" backHref="/profile" />

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <SectionHeader>{section.title}</SectionHeader>
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <Square size={14} className="mt-1 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}

        <Card className="border-primary/30 bg-primary-soft md:col-span-2">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-primary" aria-hidden="true" />
            <SectionHeader>Geld-Spar-Tipps</SectionHeader>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
