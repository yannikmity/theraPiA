"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/track";

// Browser-Druck: der Druckdialog bietet „Als PDF sichern“. Keine PDF-Bibliothek – das Dokument ist die Seite selbst
// (print:-Regeln, A4 über @page). Getrackt wird nur, ob nach Supervisor:in gefiltert war.
export function PrintButton({ supervisor }: { supervisor: boolean }) {
  return (
    <Button
      type="button"
      onClick={() => {
        track("nachweis_printed", { supervisor });
        window.print();
      }}
    >
      <Printer /> Drucken / PDF
    </Button>
  );
}
