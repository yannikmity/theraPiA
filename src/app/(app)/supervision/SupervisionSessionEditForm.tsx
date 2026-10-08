"use client";

import { useMemo, useRef, useState } from "react";
import { SupervisionSession, SupervisionSetting, Supervisor } from "@/types";
import { FormField, fieldErrorId } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { dateError } from "@/components/forms/date";
import { DURATION_MAX_MINUTES, DURATION_MIN_MINUTES, durationError } from "@/components/forms/duration";
import { compareNatural } from "@/lib/collation";
import { SUPERVISION_SETTING_LABELS, SUPERVISION_SETTING_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface LinkOption {
  id: string;
  label: string;
  /** Fall der Therapiesitzung – nur bei Supervisionen von Einzeltherapien */
  patientId?: string;
}

export interface SupervisionFormValues {
  supervisorId: string;
  date: string;
  durationMinutes: number;
  setting: SupervisionSetting;
  linkedIds: string[];
  caseShares: { patientId: string; minutes: number }[];
}

interface SupervisionSessionEditFormProps {
  session: SupervisionSession;
  supervisors: Supervisor[];
  /** Zuordenbare Sitzungen zum Datum im Formular – Therapiesitzungen oder Doppelstunden, je nach Art der Supervision */
  linkOptionsFor: (date: string) => LinkOption[];
  /** Beschriftung eines Falls (Chiffre) bei der Dauer je Patient:in */
  caseLabel?: (patientId: string) => string;
  saving: boolean;
  onSave: (values: SupervisionFormValues) => Promise<void>;
  onCancel: () => void;
}

// Die Art (Einzel-/Gruppentherapie) ist nicht änderbar: sie bestimmt, welche Sitzungen verknüpfbar sind. Das Setting
// (Einzel/Gruppe) schon.
// noValidate: Datum und Dauer prüfen dateError/durationError mit eigener Meldung am Feld (#28, #56).
// Die Zuordnungen sind ein fieldset mit legend, damit Screenreader die Checkbox-Gruppe benennen (#43).
// Einzeltherapie-Supervision mit Fällen (#40): Dauer je Patient:in, vorbelegt mit den gespeicherten Anteilen; die
// Gesamtdauer ist ihre Summe. Die Fälle ergeben sich aus den gewählten Sitzungen. Ein gespeicherter Fall, dessen
// Sitzungen gelöscht wurden, bleibt mit seinem Anteil stehen und lässt sich ausdrücklich entfernen. Zeit ohne
// vorhandenen Fall (Anteil einer gelöschten Patient:in) steht als feste Zeile darunter und zählt zur Gesamtdauer.
export function SupervisionSessionEditForm({
  session,
  supervisors,
  linkOptionsFor,
  caseLabel = (id) => id,
  saving,
  onSave,
  onCancel,
}: SupervisionSessionEditFormProps) {
  const [supervisorId, setSupervisorId] = useState<string>(session.supervisorId);
  const [setting, setSetting] = useState<SupervisionSetting>(session.setting);
  const [date, setDate] = useState(session.date);
  const [duration, setDuration] = useState(String(session.durationMinutes));
  const [linkedIds, setLinkedIds] = useState<string[]>(
    session.kind === "group" ? [...session.linkedGroupSessionIds] : [...session.linkedTherapySessionIds]
  );
  // Die Auswahl folgt dem Datum im Formular, nicht dem gespeicherten.
  const linkOptions = useMemo(() => linkOptionsFor(date), [linkOptionsFor, date]);
  const [submitted, setSubmitted] = useState(false);
  const [caseMinutes, setCaseMinutes] = useState<Record<string, string>>(() =>
    Object.fromEntries(session.caseShares.map((c) => [c.patientId, String(c.minutes)]))
  );
  // Gespeicherte Fälle ohne verknüpfte Sitzung. Eigene Sitzungen stehen unabhängig vom Datum in den Optionen.
  const [keptCases, setKeptCases] = useState<string[]>(() => {
    const own = new Set<string>(session.linkedTherapySessionIds);
    const withSessions = new Set(linkOptions.filter((o) => own.has(o.id)).map((o) => o.patientId));
    return session.caseShares.map((c): string => c.patientId).filter((id) => !withSessions.has(id));
  });
  const caseRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const patientOf = new Map(linkOptions.map((o) => [o.id, o.patientId]));
  const linkedCases = linkedIds.map((id) => patientOf.get(id)).filter((p): p is string => p !== undefined);
  const caseIds =
    session.kind === "group"
      ? []
      : [...new Set([...linkedCases, ...keptCases])].sort((a, b) => compareNatural(caseLabel(a), caseLabel(b)));
  const storedSum = session.caseShares.reduce((sum, c) => sum + c.minutes, 0);
  const gap = session.caseShares.length > 0 ? Math.max(0, session.durationMinutes - storedSum) : 0;
  const caseTotal = gap + caseIds.reduce((sum, id) => sum + (Number(caseMinutes[id]) || 0), 0);
  const caseTotalMessage =
    submitted && caseTotal > DURATION_MAX_MINUTES
      ? `Gesamtdauer ${caseTotal} Min überschreitet das Maximum von ${DURATION_MAX_MINUTES} Min.`
      : undefined;
  const durationRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const idFor = (field: string) => `${field}-${session.id}`;
  const durationMessage = submitted && caseIds.length === 0 ? durationError(duration) : undefined;
  const dateMessage = submitted ? dateError(date) : undefined;

  // Datumswechsel (#37): Sitzungen, die zum neuen Datum nicht mehr angeboten werden, abwählen – sonst würden sie
  // unsichtbar mitgespeichert. Ihre Fälle verschwinden damit aus der Dauer je Patient:in; ein dort schon eingetragener,
  // nicht gespeicherter Anteil wird verworfen. Gespeicherte Zuordnungen stehen unabhängig vom Datum in den Optionen.
  function changeDate(next: string) {
    setDate(next);
    const offered = new Set(linkOptionsFor(next).map((o) => o.id));
    const kept = linkedIds.filter((id) => offered.has(id));
    if (kept.length === linkedIds.length) return;
    setLinkedIds(kept);
    const stillLinked = new Set(kept.map((id) => patientOf.get(id)));
    const stored = new Set<string>(session.caseShares.map((c) => c.patientId));
    const dropped = linkedCases.filter((p) => !stillLinked.has(p) && !stored.has(p));
    if (dropped.length > 0) {
      setCaseMinutes((prev) => Object.fromEntries(Object.entries(prev).filter(([p]) => !dropped.includes(p))));
    }
  }

  function toggle(id: string) {
    setLinkedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (dateError(date)) {
      dateRef.current?.focus();
      return;
    }
    if (caseIds.length === 0) {
      if (durationError(duration)) {
        durationRef.current?.focus();
        return;
      }
      void onSave({ supervisorId, date, durationMinutes: Number(duration), setting, linkedIds, caseShares: [] });
      return;
    }
    const invalid = caseIds.find((id) => durationError(caseMinutes[id] ?? ""));
    if (invalid !== undefined) {
      caseRefs.current[invalid]?.focus();
      return;
    }
    if (caseTotal > DURATION_MAX_MINUTES) return;
    const caseShares = caseIds.map((id) => ({ patientId: id, minutes: Number(caseMinutes[id]) }));
    // caseTotal enthält die Zeit ohne Fall – sie bleibt beim Speichern erhalten.
    void onSave({ supervisorId, date, durationMinutes: caseTotal, setting, linkedIds, caseShares });
  }

  return (
    <form noValidate className="my-2 space-y-3 rounded-lg border border-primary/40 p-3" onSubmit={submit}>
      <FormField label="Supervisor:in" htmlFor={idFor("supervisor")}>
        <NativeSelect
          id={idFor("supervisor")}
          value={supervisorId}
          onChange={(e) => setSupervisorId(e.target.value)}
          disabled={saving}
          wrapperClassName="w-full"
        >
          {supervisors.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
              {!s.isActive ? " (inaktiv)" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Setting" htmlFor={idFor("setting")}>
        <NativeSelect
          id={idFor("setting")}
          value={setting}
          onChange={(e) => setSetting(e.target.value as SupervisionSetting)}
          disabled={saving}
          wrapperClassName="w-full"
        >
          {SUPERVISION_SETTING_ORDER.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {SUPERVISION_SETTING_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Datum" htmlFor={idFor("date")} error={dateMessage}>
        <Input
          ref={dateRef}
          id={idFor("date")}
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          aria-invalid={dateMessage ? true : undefined}
          aria-describedby={dateMessage ? fieldErrorId(idFor("date")) : undefined}
          disabled={saving}
          required
        />
      </FormField>
      {caseIds.length === 0 && (
        <FormField label="Dauer gesamt (Minuten)" htmlFor={idFor("duration")} error={durationMessage}>
          <Input
            ref={durationRef}
            id={idFor("duration")}
            type="number"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            min={DURATION_MIN_MINUTES}
            max={DURATION_MAX_MINUTES}
            aria-invalid={durationMessage ? true : undefined}
            aria-describedby={durationMessage ? fieldErrorId(idFor("duration")) : undefined}
            disabled={saving}
            required
          />
        </FormField>
      )}
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm leading-none font-medium">
          {session.kind === "group" ? "Besprochene Doppelstunden" : "Besprochene Sitzungen"}
        </legend>
        {linkOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Keine zuordenbaren Sitzungen vorhanden.</p>
        ) : (
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {linkOptions.map((o) => {
              const checked = linkedIds.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors",
                    checked ? "border-primary/40 bg-primary-soft" : "border-border hover:border-input"
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(o.id)} disabled={saving} />
                  <span className="text-sm text-foreground">{o.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      {caseIds.length > 0 && (
        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-2 text-sm leading-none font-medium">Dauer je Patient:in (Minuten)</legend>
          {caseIds.map((id) => {
            const fieldId = idFor(`case-${id}`);
            const message = submitted ? durationError(caseMinutes[id] ?? "") : undefined;
            return (
              <div key={id} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <FormField label={caseLabel(id)} htmlFor={fieldId} error={message}>
                    <Input
                      ref={(el) => {
                        caseRefs.current[id] = el;
                      }}
                      id={fieldId}
                      type="number"
                      inputMode="numeric"
                      value={caseMinutes[id] ?? ""}
                      onChange={(e) => setCaseMinutes((prev) => ({ ...prev, [id]: e.target.value }))}
                      min={DURATION_MIN_MINUTES}
                      max={DURATION_MAX_MINUTES}
                      aria-invalid={message ? true : undefined}
                      aria-describedby={message ? fieldErrorId(fieldId) : undefined}
                      disabled={saving}
                      required
                    />
                  </FormField>
                </div>
                {keptCases.includes(id) && !linkedCases.includes(id) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setKeptCases((prev) => prev.filter((x) => x !== id))}
                    disabled={saving}
                    aria-label={`${caseLabel(id)} entfernen`}
                  >
                    Entfernen
                  </Button>
                )}
              </div>
            );
          })}
          {gap > 0 && (
            <p className="text-sm text-muted-foreground">Ohne Fall (gelöschte Patient:in): {gap} Min</p>
          )}
          <p className={cn("text-xs", caseTotalMessage ? "text-destructive" : "text-muted-foreground")}>
            {caseTotalMessage ?? `Gesamt: ${caseTotal} Min`}
          </p>
        </fieldset>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={saving} className="flex-1">
          Speichern
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="flex-1">
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
