"use client";

import { useState, type FormEvent } from "react";
import { PenLine, RotateCcw, Save } from "lucide-react";
import {
  REGEL_FELDER,
  REGEL_GRUPPEN,
  REGEL_LABELS,
  eingabeLabel,
  formatRegelwert,
  type RegelAbweichungen,
  type RegelFeld,
  type RegelGruppe,
  type Regelwerk,
} from "@/lib/ausbildungsregeln/model";
import type { ActionResult } from "@/lib/action-result";
import { formatZahlDe, parseZahlDe } from "@/lib/format";
import { runAction } from "@/lib/run-action";
import { ActionError } from "@/components/ActionError";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton, FormField, fieldErrorId } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { resetAbweichungenAction, saveAbweichungenAction } from "./actions";

type Werte = Record<RegelFeld, string>;
type Aktiv = Record<RegelGruppe["id"], boolean>;

function zustandAus(regelwerk: Regelwerk): { werte: Werte; aktiv: Aktiv } {
  const werte = Object.fromEntries(
    REGEL_FELDER.map((feld) => [feld, formatZahlDe(regelwerk.abweichungen[feld] ?? regelwerk.basis[feld])])
  ) as Werte;
  const aktiv = Object.fromEntries(
    REGEL_GRUPPEN.map((gruppe) => [gruppe.id, gruppe.felder.some((feld) => regelwerk.abweichungen[feld] !== null)])
  ) as Aktiv;
  return { werte, aktiv };
}

// Persönliche Abweichungen (#8): je Gruppe entweder geerbt (Wert + Herkunft) oder persönlich (Eingabefelder, vorbelegt
// mit dem geerbten Wert). Verhältnis und Gruppenziele nur als Paar. Speichern schickt für geerbte Gruppen null.
export function RegelAbweichungenForm({ initial }: { initial: Regelwerk }) {
  const [regelwerk, setRegelwerk] = useState(initial);
  const [{ werte, aktiv }, setZustand] = useState(() => zustandAus(initial));
  const [fehler, setFehler] = useState<ActionResult<unknown> | null>(null);
  const [busy, setBusy] = useState<"speichern" | "zuruecksetzen" | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const herkunft = regelwerk.basisQuelle === "instanz" ? "Ausbildungsprofil der Instanz" : "Standardwert";

  async function ausfuehren(art: "speichern" | "zuruecksetzen", call: () => Promise<ActionResult<Regelwerk>>) {
    setBusy(art);
    setFehler(null);
    setErfolg(null);
    const result = await runAction(call);
    setBusy(null);
    if (result.success) {
      setRegelwerk(result.data);
      setZustand(zustandAus(result.data));
      setErfolg(
        art === "speichern"
          ? "Gespeichert – Dashboard und Nachweis rechnen jetzt mit diesen Werten."
          : result.data.basisQuelle === "instanz"
            ? "Zurückgesetzt – es gelten wieder die Werte aus dem Ausbildungsprofil der Instanz."
            : "Zurückgesetzt – es gelten wieder die Standardwerte."
      );
    } else {
      setFehler(result);
    }
  }

  function umschalten(gruppe: RegelGruppe, an: boolean) {
    setErfolg(null);
    setZustand((z) => {
      const neueWerte = { ...z.werte };
      if (an) for (const feld of gruppe.felder) neueWerte[feld] = formatZahlDe(regelwerk.basis[feld]);
      return { werte: neueWerte, aktiv: { ...z.aktiv, [gruppe.id]: an } };
    });
  }

  function speichern(event: FormEvent) {
    event.preventDefault();
    const eingabe = {} as RegelAbweichungen;
    for (const gruppe of REGEL_GRUPPEN) {
      for (const feld of gruppe.felder) eingabe[feld] = aktiv[gruppe.id] ? parseZahlDe(werte[feld]) : null;
    }
    void ausfuehren("speichern", () => saveAbweichungenAction(eingabe));
  }

  const feldFehler = (feld: RegelFeld) => (fehler && !fehler.success ? fehler.fieldErrors?.[feld]?.[0] : undefined);
  const allgemein = fehler && !fehler.success ? { ...fehler, fieldErrors: undefined } : null;
  const gesperrt = busy !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Meine Ausbildungsregeln"
        backHref="/profile"
        subtitle="Nur nötig, wenn für dich andere Vorgaben gelten als im Ausbildungsprofil – etwa bei einem anderen Institut oder Ausbildungsstand"
      />
      <Card asChild>
        <form onSubmit={speichern} noValidate className="space-y-5">
          <ActionError result={allgemein} />
          {REGEL_GRUPPEN.map((gruppe) => (
            <fieldset key={gruppe.id} className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">{gruppe.titel}</legend>
              <p className="text-xs text-muted-foreground">{gruppe.hinweis}</p>
              {aktiv[gruppe.id] ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {gruppe.felder.map((feld) => {
                    const id = `regel-${feld}`;
                    const meldung = feldFehler(feld);
                    return (
                      <FormField key={feld} label={eingabeLabel(feld)} htmlFor={id} error={meldung}>
                        <Input
                          id={id}
                          inputMode="decimal"
                          value={werte[feld]}
                          onChange={(e) => setZustand((z) => ({ ...z, werte: { ...z.werte, [feld]: e.target.value } }))}
                          disabled={gesperrt}
                          aria-invalid={meldung ? true : undefined}
                          aria-describedby={meldung ? fieldErrorId(id) : undefined}
                        />
                        <p className="text-xs text-muted-foreground">
                          {herkunft}: {formatRegelwert(feld, regelwerk.basis[feld])}
                        </p>
                      </FormField>
                    );
                  })}
                </div>
              ) : (
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  {gruppe.felder.map((feld) => (
                    <div key={feld}>
                      <dt className="text-muted-foreground">{REGEL_LABELS[feld]}</dt>
                      <dd className="font-medium text-foreground">
                        {formatRegelwert(feld, regelwerk.basis[feld])}{" "}
                        <span className="text-xs font-normal text-muted-foreground">({herkunft})</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {aktiv[gruppe.id] ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${gruppe.titel}: auf den geerbten Wert zurücksetzen`}
                  onClick={() => umschalten(gruppe, false)}
                  disabled={gesperrt}
                >
                  <RotateCcw /> Zurücksetzen
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${gruppe.titel}: Abweichung festlegen`}
                  onClick={() => umschalten(gruppe, true)}
                  disabled={gesperrt}
                >
                  <PenLine /> Abweichung festlegen
                </Button>
              )}
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={busy === "speichern"} disabled={gesperrt}>
              <Save /> Regeln speichern
            </Button>
            {regelwerk.abweichend.length > 0 && (
              <ConfirmButton
                label={
                  <>
                    <RotateCcw /> Alle zurücksetzen
                  </>
                }
                question="Alle persönlichen Abweichungen löschen?"
                description={
                  regelwerk.basisQuelle === "instanz"
                    ? "Danach gelten wieder die Werte aus dem Ausbildungsprofil der Instanz."
                    : "Danach gelten wieder die Standardwerte."
                }
                confirmLabel="Ja, zurücksetzen"
                onConfirm={() => ausfuehren("zuruecksetzen", () => resetAbweichungenAction({}))}
                loading={busy === "zuruecksetzen"}
                disabled={gesperrt}
                className="h-9 gap-1.5 px-2.5 hover:bg-accent [&_svg]:size-4"
              />
            )}
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
