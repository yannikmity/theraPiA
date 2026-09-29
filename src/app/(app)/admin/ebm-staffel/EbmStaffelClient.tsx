"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { EbmStaffel } from "@/lib/ausbildungsregeln/model";
import { ebmStaffelFuer } from "@/lib/ausbildungsregeln/resolve";
import type { ActionResult } from "@/lib/action-result";
import { formatDateDe } from "@/lib/dates";
import { formatZahlDe, parseZahlDe } from "@/lib/format";
import { runAction } from "@/lib/run-action";
import { ActionError, errorAt, type ScopedActionError } from "@/components/ActionError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton, FormField, fieldErrorId } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { deleteEbmStaffelAction, saveEbmStaffelAction } from "./actions";

interface EntwurfStufe {
  kinderzahl: string;
  total: string;
  share: string;
}

interface Entwurf {
  id: string | null;
  gueltigAb: string;
  stufen: EntwurfStufe[];
}

const euro = (wert: number) => wert.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SPALTEN = "grid grid-cols-[4rem_1fr_1fr_2.75rem] items-center gap-2";
const STUFEN_FELDER = [
  { feld: "kinderzahl", label: "Kinderzahl", inputMode: "numeric" },
  { feld: "total", label: "Gesamthonorar", inputMode: "decimal" },
  { feld: "share", label: "Eigener Anteil", inputMode: "decimal" },
] as const;
const stufeFehlerId = (i: number, feld: string) => `stufe-${i}-${feld}-fehler`;
const STUFEN_FEHLER_ID = "staffel-stufen-fehler";

// Neue Staffel = Kopie der neuesten mit „heute“ als Beginn; Bearbeiten übernimmt die Staffel. Die Standard-Staffel
// (id null) wird beim Speichern zur ersten Datenbankzeile.
function entwurfAus(staffel: EbmStaffel, neu: boolean, heute: string): Entwurf {
  return {
    id: neu ? null : staffel.id,
    gueltigAb: neu ? heute : staffel.gueltigAb,
    stufen: staffel.stufen.map((s) => ({ kinderzahl: String(s.kinderzahl), total: formatZahlDe(s.total), share: formatZahlDe(s.share) })),
  };
}

export function EbmStaffelClient({ initial, heute }: { initial: EbmStaffel[]; heute: string }) {
  const [staffeln, setStaffeln] = useState(initial);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [fehler, setFehler] = useState<ScopedActionError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const gespeicherte = staffeln.filter((s) => s.id !== null).length;
  const heuteGueltig = ebmStaffelFuer(heute, staffeln);
  const entwurfFehler = errorAt(fehler, "entwurf");
  const feldFehler = (pfad: string) => (entwurfFehler && !entwurfFehler.success ? entwurfFehler.fieldErrors?.[pfad]?.[0] : undefined);
  const allgemein = entwurfFehler && !entwurfFehler.success ? { ...entwurfFehler, fieldErrors: undefined } : null;

  async function ausfuehren(scope: string, call: () => Promise<ActionResult<EbmStaffel[]>>, danach?: () => void) {
    setBusy(scope);
    setFehler(null);
    const result = await runAction(call);
    setBusy(null);
    if (result.success) {
      setStaffeln(result.data);
      danach?.();
    } else {
      setFehler({ scope, result });
    }
  }

  function oeffnen(neuerEntwurf: Entwurf) {
    setFehler(null);
    setEntwurf(neuerEntwurf);
  }

  function speichern(event: FormEvent) {
    event.preventDefault();
    if (!entwurf) return;
    const eingabe = {
      id: entwurf.id,
      gueltigAb: entwurf.gueltigAb,
      stufen: entwurf.stufen.map((s) => ({ kinderzahl: parseZahlDe(s.kinderzahl), total: parseZahlDe(s.total), share: parseZahlDe(s.share) })),
    };
    void ausfuehren("entwurf", () => saveEbmStaffelAction(eingabe), () => setEntwurf(null));
  }

  function stufeAendern(i: number, feld: keyof EntwurfStufe, wert: string) {
    setEntwurf((e) => e && { ...e, stufen: e.stufen.map((s, j) => (j === i ? { ...s, [feld]: wert } : s)) });
  }

  function stufeHinzufuegen() {
    setEntwurf((e) => {
      if (!e) return e;
      const letzte = e.stufen.at(-1);
      // Ist die letzte Kinderzahl (noch) keine Zahl, bleibt das Feld leer statt „NaN“ vorzuschlagen.
      const vorige = letzte ? parseZahlDe(letzte.kinderzahl) : 2;
      const kinderzahl = Number.isFinite(vorige) ? String(vorige + 1) : "";
      return { ...e, stufen: [...e.stufen, { kinderzahl, total: "", share: "" }] };
    });
  }

  function stufeEntfernen(i: number) {
    setEntwurf((e) => e && { ...e, stufen: e.stufen.filter((_, j) => j !== i) });
  }

  const gesperrt = busy !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="EBM-Staffel"
        backHref="/admin"
        subtitle="Honorar je Doppelstunde der Gruppe nach Kinderzahl"
        actions={
          <Button
            variant="link"
            size="sm"
            onClick={() => oeffnen(entwurfAus(staffeln[staffeln.length - 1], true, heute))}
            disabled={entwurf !== null || gesperrt}
          >
            <Plus /> Neue Staffel
          </Button>
        }
      />

      <Card>
        <p className="text-sm text-muted-foreground">
          Maßgeblich ist das Datum der Doppelstunde: Es gilt die Staffel mit dem spätesten Gültigkeitsbeginn bis zu diesem
          Tag, für Doppelstunden vor der ältesten Staffel die älteste. Unter der kleinsten Kinderzahl gibt es kein Honorar,
          darüber gilt die größte Stufe. Änderungen wirken auch auf zurückliegende Doppelstunden in Finanzen und Prognose.
        </p>
      </Card>

      {entwurf && (
        <Card asChild className="border-primary/40">
          <form onSubmit={speichern} noValidate aria-label={entwurf.id === null ? "Neue Staffel" : "Staffel bearbeiten"}>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-foreground">{entwurf.id === null ? "Neue Staffel" : "Staffel bearbeiten"}</h2>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Formular schließen" onClick={() => setEntwurf(null)}>
                <X />
              </Button>
            </div>
            <ActionError result={allgemein} />
            <FormField label="Gültig ab" htmlFor="staffel-gueltig-ab" error={feldFehler("gueltigAb")}>
              <Input
                id="staffel-gueltig-ab"
                type="date"
                value={entwurf.gueltigAb}
                onChange={(e) => setEntwurf({ ...entwurf, gueltigAb: e.target.value })}
                disabled={gesperrt}
                aria-invalid={feldFehler("gueltigAb") ? true : undefined}
                aria-describedby={feldFehler("gueltigAb") ? fieldErrorId("staffel-gueltig-ab") : undefined}
              />
            </FormField>
            <div className="space-y-2">
              <div className={`${SPALTEN} text-xs font-medium text-muted-foreground`} aria-hidden="true">
                <span>Kinder</span>
                <span>Gesamthonorar (EUR)</span>
                <span>Eigener Anteil (EUR)</span>
                <span />
              </div>
              {entwurf.stufen.map((stufe, i) => (
                <div key={i} className="space-y-1">
                  <div className={SPALTEN}>
                    {STUFEN_FELDER.map(({ feld, label, inputMode }) => {
                      // Feldfehler je Eingabe (Zod-Pfad stufen.<i>.<feld>); die Lückenlos-Meldung hängt an den Kinderzahlen.
                      const meldung = feldFehler(`stufen.${i}.${feld}`);
                      const beschreibung = [
                        meldung ? stufeFehlerId(i, feld) : null,
                        feld === "kinderzahl" && feldFehler("stufen") ? STUFEN_FEHLER_ID : null,
                      ].filter(Boolean);
                      return (
                        <Input
                          key={feld}
                          aria-label={`${label} Stufe ${i + 1}`}
                          inputMode={inputMode}
                          value={stufe[feld]}
                          onChange={(e) => stufeAendern(i, feld, e.target.value)}
                          disabled={gesperrt}
                          aria-invalid={meldung ? true : undefined}
                          aria-describedby={beschreibung.length > 0 ? beschreibung.join(" ") : undefined}
                        />
                      );
                    })}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Stufe ${i + 1} entfernen`}
                      onClick={() => stufeEntfernen(i)}
                      disabled={gesperrt || entwurf.stufen.length === 1}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {STUFEN_FELDER.map(({ feld, label }) => {
                    const meldung = feldFehler(`stufen.${i}.${feld}`);
                    return (
                      meldung && (
                        <p key={feld} id={stufeFehlerId(i, feld)} className="text-xs text-destructive">
                          {label}: {meldung}
                        </p>
                      )
                    );
                  })}
                </div>
              ))}
              {feldFehler("stufen") && (
                <p id={STUFEN_FEHLER_ID} className="text-xs text-destructive">
                  {feldFehler("stufen")}
                </p>
              )}
              <Button type="button" variant="link" size="sm" className="justify-start px-0 has-[>svg]:px-0" onClick={stufeHinzufuegen} disabled={gesperrt}>
                <Plus /> Stufe hinzufügen
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy === "entwurf"} disabled={gesperrt}>
                <Save /> Staffel speichern
              </Button>
              <Button type="button" variant="outline" onClick={() => setEntwurf(null)} disabled={gesperrt}>
                Abbrechen
              </Button>
            </div>
          </form>
        </Card>
      )}

      {[...staffeln].reverse().map((staffel) => {
        const scope = `loeschen:${staffel.id}`;
        const ab = formatDateDe(staffel.gueltigAb);
        return (
          <Card key={staffel.id ?? "standard"} role="region" aria-label={`Staffel ab ${ab}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium text-foreground">Gültig ab {ab}</h2>
                {staffel === heuteGueltig && <Badge variant="success-soft">gilt heute</Badge>}
                {staffel.id === null && <Badge variant="primary-soft">Standardwerte, noch nicht gespeichert</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Staffel ab ${ab} bearbeiten`}
                  onClick={() => oeffnen(entwurfAus(staffel, false, heute))}
                  disabled={entwurf !== null || gesperrt}
                >
                  <Pencil /> Bearbeiten
                </Button>
                {staffel.id !== null && gespeicherte > 1 && (
                  <ConfirmButton
                    label={
                      <>
                        <Trash2 /> Löschen
                      </>
                    }
                    question={`Staffel ab ${ab} löschen?`}
                    description="Doppelstunden in ihrem Zeitraum werden danach mit der vorherigen Staffel gerechnet (vor der ältesten mit der ältesten)."
                    onConfirm={() => ausfuehren(scope, () => deleteEbmStaffelAction({ id: staffel.id! }))}
                    loading={busy === scope}
                    disabled={gesperrt}
                    className="h-9 gap-1.5 px-2.5 text-destructive hover:bg-destructive-soft [&_svg]:size-4"
                  />
                )}
              </div>
            </div>
            <ActionError result={errorAt(fehler, scope)} />
            <table className="w-full text-sm">
              <caption className="sr-only">Stufen der Staffel ab {ab}</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Kinder</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Gesamthonorar</th>
                  <th className="py-1.5 text-right font-medium">Eigener Anteil</th>
                </tr>
              </thead>
              <tbody>
                {staffel.stufen.map((stufe, i) => (
                  <tr key={stufe.kinderzahl} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3">{i === staffel.stufen.length - 1 ? `${stufe.kinderzahl} und mehr` : stufe.kinderzahl}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{euro(stufe.total)} EUR</td>
                    <td className="py-1.5 text-right tabular-nums">{euro(stufe.share)} EUR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
