"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, SectionHeader } from "@/components/ui";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

const ALL_YEARS = "alle";

// Ausgaben für die Steuererklärung (#65): Link auf den CSV-Export, wahlweise für ein Kalenderjahr. Wie die Links unter
// „Profil → Daten“ ohne fetch – der Browser speichert die Datei. `years` absteigend, vorgewählt ist das neueste.
export function ExpenseExport({ years }: { years: number[] }) {
  const [year, setYear] = useState(years[0] === undefined ? ALL_YEARS : String(years[0]));
  if (years.length === 0) return null;
  const href = year === ALL_YEARS ? "/api/export/csv/expenses" : `/api/export/csv/expenses?jahr=${year}`;
  return (
    <Card>
      <SectionHeader>Ausgaben exportieren</SectionHeader>
      <p className="text-sm text-muted-foreground">
        Supervisionskosten je Termin mit Summe als CSV, zum Beispiel als Beleg für die Steuererklärung.
      </p>
      <FormField label="Zeitraum" htmlFor="expense-year">
        <NativeSelect id="expense-year" value={year} onChange={(e) => setYear(e.target.value)} wrapperClassName="w-full">
          {years.map((y) => (
            <NativeSelectOption key={y} value={String(y)}>
              {y}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={ALL_YEARS}>Alle Jahre</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <a
        href={href}
        download
        className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        onClick={() => track("export_downloaded", { entity: "expenses" })}
      >
        <FileDown /> Ausgaben als CSV
      </a>
    </Card>
  );
}
