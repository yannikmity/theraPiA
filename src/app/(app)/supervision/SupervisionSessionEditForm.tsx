"use client";

import { useRef, useState } from "react";
import { SupervisionSession, SupervisionSetting, Supervisor } from "@/types";
import { FormField, fieldErrorId } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { dateError } from "@/components/forms/date";
import { DURATION_MAX_MINUTES, DURATION_MIN_MINUTES, durationError } from "@/components/forms/duration";
import { SUPERVISION_SETTING_LABELS, SUPERVISION_SETTING_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface LinkOption {
  id: string;
  label: string;
}

export interface SupervisionFormValues {
  supervisorId: string;
  date: string;
  durationMinutes: number;
  setting: SupervisionSetting;
  linkedIds: string[];
}

interface SupervisionSessionEditFormProps {
  session: SupervisionSession;
  supervisors: Supervisor[];
  /** Zuordenbare Sitzungen – Therapiesitzungen oder Doppelstunden, je nach Art der Supervision */
  linkOptions: LinkOption[];
  saving: boolean;
  onSave: (values: SupervisionFormValues) => Promise<void>;
  onCancel: () => void;
}

// Die Art (Einzel-/Gruppentherapie) ist nicht änderbar: sie bestimmt, welche Sitzungen verknüpfbar sind. Das Setting
// (Einzel/Gruppe) schon.
// noValidate: Datum und Dauer prüfen dateError/durationError mit eigener Meldung am Feld (#28, #56).
// Die Zuordnungen sind ein fieldset mit legend, damit Screenreader die Checkbox-Gruppe benennen (#43).
export function SupervisionSessionEditForm({
  session,
  supervisors,
  linkOptions,
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
  const [submitted, setSubmitted] = useState(false);
  const durationRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const idFor = (field: string) => `${field}-${session.id}`;
  const durationMessage = submitted ? durationError(duration) : undefined;
  const dateMessage = submitted ? dateError(date) : undefined;

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
    if (durationError(duration)) {
      durationRef.current?.focus();
      return;
    }
    void onSave({ supervisorId, date, durationMinutes: Number(duration), setting, linkedIds });
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
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={dateMessage ? true : undefined}
          aria-describedby={dateMessage ? fieldErrorId(idFor("date")) : undefined}
          disabled={saving}
          required
        />
      </FormField>
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
