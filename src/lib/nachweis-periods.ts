import { endOfQuarter, format, startOfQuarter, subQuarters } from "date-fns";
import type { UserData } from "./db/user-data";
import type { NachweisFilter } from "./nachweis";

// Zeitraum-Vorgaben der Nachweis-Seite. Bewusst ohne Zod und ohne Datenbank: das Formular (Client) rechnet
// dieselben Werte wie die Seite (Server) aus einem gemeinsamen `today`.
export const PERIOD_PRESETS = ["quartal", "vorquartal", "gesamt"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  quartal: "Aktuelles Quartal",
  vorquartal: "Letztes Quartal",
  gesamt: "Ausbildung gesamt",
};

export interface Period {
  from: string;
  to: string;
}

const iso = (date: Date) => format(date, "yyyy-MM-dd");

// „gesamt“ reicht vom ersten Eintrag bis heute; ohne Einträge ist es der heutige Tag.
export function presetPeriod(preset: PeriodPreset, today: Date, firstRecordDate: string | null): Period {
  switch (preset) {
    case "quartal":
      return { from: iso(startOfQuarter(today)), to: iso(endOfQuarter(today)) };
    case "vorquartal": {
      const previous = subQuarters(today, 1);
      return { from: iso(startOfQuarter(previous)), to: iso(endOfQuarter(previous)) };
    }
    case "gesamt":
      return { from: firstRecordDate ?? iso(today), to: iso(today) };
  }
}

export function matchingPreset(period: Period, today: Date, firstRecordDate: string | null): PeriodPreset | null {
  return (
    PERIOD_PRESETS.find((preset) => {
      const candidate = presetPeriod(preset, today, firstRecordDate);
      return candidate.from === period.from && candidate.to === period.to;
    }) ?? null
  );
}

// Frühestes Datum aller Einträge: Behandlungsbeginn, Sitzungen, Supervisionen, Gruppenstart, Doppelstunden.
export function firstRecordDate(data: UserData): string | null {
  const dates = [
    ...data.patients.map((p) => p.startDate),
    ...data.therapySessions.map((s) => s.date),
    ...data.supervisionSessions.map((s) => s.date),
    ...data.groups.map((g) => g.startDate),
    ...data.groupSessions.map((s) => s.date),
  ];
  return dates.length === 0 ? null : dates.reduce((min, date) => (date < min ? date : min));
}

// Der Filter steht in der URL: verlinkbar, Zurück-Knopf, Server rendert das Dokument.
export function nachweisHref(filter: NachweisFilter): string {
  const query = new URLSearchParams({ from: filter.from, to: filter.to });
  if (filter.supervisorId) query.set("supervisor", filter.supervisorId);
  return `/nachweis?${query.toString()}`;
}
