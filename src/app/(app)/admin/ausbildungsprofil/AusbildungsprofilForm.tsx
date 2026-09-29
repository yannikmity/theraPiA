"use client";

import { useState, type FormEvent } from "react";
import { RotateCcw, Save } from "lucide-react";
import {
  REGEL_FELDER,
  REGEL_GRUPPEN,
  eingabeLabel,
  formatRegelwert,
  type Ausbildungsregeln,
  type RegelFeld,
} from "@/lib/ausbildungsregeln/model";
import type { AusbildungsprofilDaten } from "@/lib/services/ausbildungsregeln";
import type { ActionResult } from "@/lib/action-result";
import { formatZahlDe, parseZahlDe } from "@/lib/format";
import { runAction } from "@/lib/run-action";
import { ActionError } from "@/components/ActionError";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton, FormField, fieldErrorId } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { resetAusbildungsprofilAction, saveAusbildungsprofilAction } from "./actions";

type Werte = Record<RegelFeld, string>;

const alsWerte = (regeln: Ausbildungsregeln): Werte =>
  Object.fromEntries(REGEL_FELDER.map((feld) => [feld, formatZahlDe(regeln[feld])])) as Werte;

// Pflege des Ausbildungsprofils (#8): sechs Werte in vier Gruppen, je mit dem Standardwert zum Vergleich. Feldfehler
// stehen am Feld, oben nur die allgemeine Meldung.
export function AusbildungsprofilForm({ initial }: { initial: AusbildungsprofilDaten }) {
  const [daten, setDaten] = useState(initial);
  const [werte, setWerte] = useState<Werte>(() => alsWerte(initial.regeln));
  const [fehler, setFehler] = useState<ActionResult<unknown> | null>(null);
  const [busy, setBusy] = useState<"speichern" | "zuruecksetzen" | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);

  async function ausfuehren(art: "speichern" | "zuruecksetzen", call: () => Promise<ActionResult<AusbildungsprofilDaten>>) {
    setBusy(art);
    setFehler(null);
    setErfolg(null);
    const result = await runAction(call);
    setBusy(null);
    if (result.success) {
      setDaten(result.data);
      setWerte(alsWerte(result.data.regeln));
      setErfolg(art === "zuruecksetzen" ? "Auf Standardwerte zurückgesetzt." : "Gespeichert.");
    } else {
      setFehler(result);
    }
  }

  function speichern(event: FormEvent) {
    event.preventDefault();
    const eingabe: Ausbildungsregeln = Object.fromEntries(REGEL_FELDER.map((feld) => [feld, parseZahlDe(werte[feld])])) as Record<RegelFeld, number>;
    void ausfuehren("speichern", () => saveAusbildungsprofilAction(eingabe));
  }

  const feldFehler = (feld: RegelFeld) => (fehler && !fehler.success ? fehler.fieldErrors?.[feld]?.[0] : undefined);
  const allgemein = fehler && !fehler.success ? { ...fehler, fieldErrors: undefined } : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Ausbildungsprofil"
        backHref="/admin"
        subtitle="Vorgaben für alle Accounts dieser Instanz – wer persönlich abweicht, behält die eigenen Werte"
      />
      {daten.quelle === "standard" && (
        <Alert variant="info">
          <AlertDescription>Noch kein Profil gespeichert – es gelten die Standardwerte.</AlertDescription>
        </Alert>
      )}
      <Card asChild>
        <form onSubmit={speichern} noValidate className="space-y-5">
          <ActionError result={allgemein} />
          {REGEL_GRUPPEN.map((gruppe) => (
            <fieldset key={gruppe.id} className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">{gruppe.titel}</legend>
              <p className="text-xs text-muted-foreground">{gruppe.hinweis}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {gruppe.felder.map((feld) => {
                  const id = `profil-${feld}`;
                  const meldung = feldFehler(feld);
                  return (
                    <FormField key={feld} label={eingabeLabel(feld)} htmlFor={id} error={meldung}>
                      <Input
                        id={id}
                        inputMode="decimal"
                        value={werte[feld]}
                        onChange={(e) => setWerte({ ...werte, [feld]: e.target.value })}
                        disabled={busy !== null}
                        aria-invalid={meldung ? true : undefined}
                        aria-describedby={meldung ? fieldErrorId(id) : undefined}
                      />
                      <p className="text-xs text-muted-foreground">Standard: {formatRegelwert(feld, daten.standard[feld])}</p>
                    </FormField>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={busy === "speichern"} disabled={busy !== null}>
              <Save /> Ausbildungsprofil speichern
            </Button>
            <ConfirmButton
              label={
                <>
                  <RotateCcw /> Auf Standardwerte zurücksetzen
                </>
              }
              question="Alle Werte auf die Standardwerte zurücksetzen?"
              description="Gilt sofort für alle Accounts ohne persönliche Abweichung."
              confirmLabel="Ja, zurücksetzen"
              onConfirm={() => ausfuehren("zuruecksetzen", () => resetAusbildungsprofilAction({}))}
              loading={busy === "zuruecksetzen"}
              disabled={busy !== null || daten.quelle === "standard"}
            />
          </div>
          {erfolg && (
            <p role="status" className="text-sm text-success">
              {erfolg}
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
