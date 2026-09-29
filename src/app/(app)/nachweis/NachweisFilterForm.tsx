"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseISO } from "date-fns";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { NachweisFilter } from "@/lib/nachweis";
import {
  matchingPreset,
  nachweisHref,
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  presetPeriod,
  type PeriodPreset,
} from "@/lib/nachweis-periods";

interface NachweisFilterFormProps {
  filter: NachweisFilter;
  supervisors: { id: string; name: string; isActive: boolean }[];
  firstRecordDate: string | null;
  /** Heutiges Datum (YYYY-MM-DD) vom Server – Server und Client rechnen dieselben Vorgaben. */
  today: string;
}

const RANGE_ERROR = "„Von“ darf nicht nach „Bis“ liegen";

// Der Filter steht in der Adresse (from, to, supervisor): Der Nachweis ist verlinkbar, der Zurück-Knopf funktioniert,
// das Dokument kommt vom Server. Vorgaben navigieren sofort (ein Klick); freie Daten und die Supervisor:in mit „Anzeigen“.
// Die Seite setzt key={nachweisHref(filter)}, damit dieser Zustand bei jeder Navigation neu aus den Props startet.
export function NachweisFilterForm({ filter, supervisors, firstRecordDate, today }: NachweisFilterFormProps) {
  const router = useRouter();
  const [from, setFrom] = useState(filter.from);
  const [to, setTo] = useState(filter.to);
  const [supervisorId, setSupervisorId] = useState(filter.supervisorId ?? "");
  const [submitted, setSubmitted] = useState(false);
  const todayDate = parseISO(today);
  const active = matchingPreset({ from, to }, todayDate, firstRecordDate);
  const rangeError = submitted && from > to ? RANGE_ERROR : undefined;

  function go(next: NachweisFilter) {
    router.push(nachweisHref(next));
  }

  function applyPreset(preset: PeriodPreset) {
    const period = presetPeriod(preset, todayDate, firstRecordDate);
    setFrom(period.from);
    setTo(period.to);
    setSubmitted(false);
    go({ ...period, supervisorId: supervisorId || null });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (from > to) return;
    go({ from, to, supervisorId: supervisorId || null });
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Nachweis filtern">
      <div role="group" aria-label="Zeitraum wählen" className="flex flex-wrap gap-2">
        {PERIOD_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={active === preset ? "default" : "outline"}
            aria-pressed={active === preset}
            onClick={() => applyPreset(preset)}
          >
            {PERIOD_PRESET_LABELS[preset]}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Von" htmlFor="nachweis-von">
          <Input id="nachweis-von" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </FormField>
        <FormField label="Bis" htmlFor="nachweis-bis" error={rangeError}>
          {/* Kein min={from}: die Reihenfolge prüft submit() mit eigener Meldung – eine native Bereichsprüfung würde
              das Absenden still blockieren (auch in jsdom). */}
          <Input
            id="nachweis-bis"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-invalid={rangeError ? true : undefined}
            required
          />
        </FormField>
        <FormField label="Supervisor:in" htmlFor="nachweis-supervisorin">
          <NativeSelect
            id="nachweis-supervisorin"
            wrapperClassName="w-full"
            value={supervisorId}
            onChange={(e) => setSupervisorId(e.target.value)}
          >
            <NativeSelectOption value="">Alle (Unterschrift Institut/Ambulanz)</NativeSelectOption>
            {supervisors.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.isActive ? s.name : `${s.name} (inaktiv)`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <Button type="submit" variant="outline">
        <Search /> Anzeigen
      </Button>
    </form>
  );
}
