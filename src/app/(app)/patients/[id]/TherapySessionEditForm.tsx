"use client";

import { useRef, useState } from "react";
import { SessionCategory, TherapySession } from "@/types";
import { FormField, fieldErrorId } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dateError } from "@/components/forms/date";
import { DURATION_MAX_MINUTES, DURATION_MIN_MINUTES, durationError } from "@/components/forms/duration";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/labels";

export interface TherapySessionFormValues {
  date: string;
  durationMinutes: number;
  notes: string;
  category: SessionCategory;
}

interface TherapySessionEditFormProps {
  session: TherapySession;
  saving: boolean;
  onSave: (values: TherapySessionFormValues) => Promise<void>;
  onCancel: () => void;
}

const CATEGORY_OPTIONS = CATEGORY_ORDER.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

// Kompaktes Inline-Formular für eine bestehende Sitzung. Bewusst keine Wiederverwendung von
// NewSessionClient: das ist ein Vollbild-Ablauf mit Typ-Umschalter und Weiterleitung.
// noValidate: Datum und Dauer prüfen dateError/durationError mit eigener Meldung am Feld (#28, #56);
// min/max bleiben für Spinner und Zahlentastatur.
export function TherapySessionEditForm({ session, saving, onSave, onCancel }: TherapySessionEditFormProps) {
  const [date, setDate] = useState(session.date);
  const [duration, setDuration] = useState(String(session.durationMinutes));
  const [category, setCategory] = useState<SessionCategory>(session.category);
  const [notes, setNotes] = useState(session.notes);
  const [submitted, setSubmitted] = useState(false);
  const durationRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const idFor = (field: string) => `${field}-${session.id}`;
  const durationMessage = submitted ? durationError(duration) : undefined;
  const dateMessage = submitted ? dateError(date) : undefined;

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
    void onSave({ date, durationMinutes: Number(duration), notes, category });
  }

  return (
    <form noValidate className="my-2 space-y-3 rounded-lg border border-primary/40 p-3" onSubmit={submit}>
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
      <FormField label="Dauer (Minuten)" htmlFor={idFor("duration")} error={durationMessage}>
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
      <FormField label="Kategorie" htmlFor={idFor("category")}>
        <NativeSelect
          id={idFor("category")}
          value={category}
          onChange={(e) => setCategory(e.target.value as SessionCategory)}
          disabled={saving}
          wrapperClassName="w-full"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <NativeSelectOption key={c.value} value={c.value}>
              {c.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Notiz" htmlFor={idFor("notes")}>
        <Textarea
          id={idFor("notes")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-20 resize-none"
          maxLength={2000}
          disabled={saving}
        />
      </FormField>
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
