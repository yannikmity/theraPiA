"use client";

import { FileDown, FileJson } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { track, type ExportEntity } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

// Einfache Links auf die bestehenden Download-Routen: kein fetch, kein Blob – der Browser speichert die Datei
// (Content-Disposition: attachment, siehe src/lib/export/http.ts). An die Statistik geht nur die Datenart.
export const CSV_LINKS: { entity: ExportEntity; href: string; label: string; description: string }[] = [
  {
    entity: "therapy_sessions",
    href: "/api/export/csv/therapy-sessions",
    label: "Therapiesitzungen",
    description: "Datum, Chiffre, Kategorie, Dauer, Notiz, Supervision",
  },
  {
    entity: "supervisions",
    href: "/api/export/csv/supervisions",
    label: "Supervisionen",
    description: "Datum, Supervisor:in, Art, Dauer, besprochene Sitzungen",
  },
  {
    entity: "group_sessions",
    href: "/api/export/csv/group-sessions",
    label: "Doppelstunden",
    description: "Datum, Gruppe, Status, Teilnehmende, Dauer, Notiz",
  },
  {
    entity: "patients",
    href: "/api/export/csv/patients",
    label: "Patient:innen",
    description: "Chiffre, Therapieart, Zeitraum, Antrag, Sitzungen",
  },
  {
    entity: "expenses",
    href: "/api/export/csv/expenses",
    label: "Ausgaben",
    description: "Supervisionskosten je Termin mit Summe, für die Steuererklärung",
  },
];

export function ExportLinks() {
  const csvLink = cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full justify-start");
  return (
    <Card>
      <SectionHeader>Export</SectionHeader>
      <p className="text-sm text-muted-foreground">
        CSV-Dateien öffnen sich direkt in Excel oder LibreOffice (Semikolon als Trenner, UTF-8, Datum als JJJJ-MM-TT,
        Dezimalkomma). Der JSON-Export enthält alle Daten dieses Accounts in einer Datei – maschinenlesbar zum Mitnehmen
        (Art. 20 DSGVO).
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CSV_LINKS.map((link) => (
          <li key={link.entity}>
            <a href={link.href} download className={csvLink} onClick={() => track("export_downloaded", { entity: link.entity })}>
              <FileDown /> {link.label} (CSV)
            </a>
            <p className="mt-1 text-xs text-muted-foreground">{link.description}</p>
          </li>
        ))}
      </ul>
      <a
        href="/api/account/export"
        download
        className={cn(buttonVariants(), "w-full sm:w-auto sm:self-start")}
        onClick={() => track("export_downloaded", { entity: "json" })}
      >
        <FileJson /> Alle Daten als JSON
      </a>
      <p className="text-xs text-muted-foreground">
        Exporte enthalten keine Passwörter und keine Einladungs- oder Reset-Links. Feedback aus dem Feedback-Widget ist nicht
        enthalten.
      </p>
    </Card>
  );
}
