import type { GroupSession, TherapySession } from "@/types";
import type { UserData } from "../db/user-data";
import { compareNatural } from "../collation";
import { toCsv, formatDecimal, formatHours, type CsvValue } from "../csv";
import { minutesToUnits, quarterOf } from "../calculations";
import {
  CATEGORY_LABELS,
  GROUP_SESSION_STATUS_LABELS,
  SUPERVISION_KIND_LABELS,
  SUPERVISION_SETTING_LABELS,
  THERAPY_TYPE_LABELS,
} from "../labels";
import { supervisionLookup, type SupervisionRef } from "../supervision-lookup";

// Eine CSV-Datei je Datenart (statt ZIP – dafür bräuchte es eine neue Abhängigkeit). Spalten auf Deutsch,
// Datum als YYYY-MM-DD (siehe csv.ts), Dauer als Minuten und als Stunden mit Dezimalkomma – außer den Ausgaben, die wie
// die Finanzseite in SV-Einheiten à 50 Min rechnen. Freitext läuft durch den Formel-Schutz in csvCell.

export type CsvExportKey = "therapy-sessions" | "supervisions" | "group-sessions" | "patients" | "expenses";

// Optionen aus der Adresse (?jahr=JJJJ); nur Exporte mit `byYear` werten sie aus.
export interface CsvExportOptions {
  year?: number;
}

const supervisionDates = (refs: SupervisionRef[]) => refs.map((r) => r.date).join(", ");
const supervisorNames = (refs: SupervisionRef[]) => [...new Set(refs.map((r) => r.supervisorName))].join(", ");

function defined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function chiffreMap(data: UserData): Map<string, string> {
  return new Map(data.patients.map((p): [string, string] => [p.id, p.chiffre]));
}

function groupNameMap(data: UserData): Map<string, string> {
  return new Map(data.groups.map((g): [string, string] => [g.id, g.name]));
}

export function therapySessionsCsv(data: UserData): string {
  const chiffreOf = chiffreMap(data);
  const lookup = supervisionLookup(data.supervisionSessions, data.supervisors);
  const rows: CsvValue[][] = data.therapySessions.map((s) => {
    const refs = lookup.forTherapySession(s.id);
    return [
      s.date,
      chiffreOf.get(s.patientId) ?? "",
      CATEGORY_LABELS[s.category],
      s.durationMinutes,
      formatHours(s.durationMinutes),
      s.notes,
      supervisionDates(refs),
      supervisorNames(refs),
    ];
  });
  return toCsv(
    ["Datum", "Chiffre", "Kategorie", "Dauer (Minuten)", "Dauer (Stunden)", "Notiz", "Supervision am", "Supervisor:in"],
    rows
  );
}

export function supervisionsCsv(data: UserData): string {
  const chiffreOf = chiffreMap(data);
  const groupNameOf = groupNameMap(data);
  const supervisorNameOf = new Map(data.supervisors.map((s): [string, string] => [s.id, s.name]));
  const therapyById = new Map(data.therapySessions.map((s): [string, TherapySession] => [s.id, s]));
  const groupSessionById = new Map(data.groupSessions.map((s): [string, GroupSession] => [s.id, s]));
  type Item = { date: string; label: string };
  const byDate = (a: Item, b: Item) => a.date.localeCompare(b.date) || compareNatural(a.label, b.label);
  const describe = (items: Item[]) => items.map((i) => `${i.label} (${i.date})`).join(", ");

  const rows: CsvValue[][] = data.supervisionSessions.map((sv) => {
    const therapy = sv.linkedTherapySessionIds
      .map((id) => therapyById.get(id))
      .filter(defined)
      .map((t): Item => ({ date: t.date, label: chiffreOf.get(t.patientId) ?? "" }))
      .sort(byDate);
    const groups = sv.linkedGroupSessionIds
      .map((id) => groupSessionById.get(id))
      .filter(defined)
      .map((g): Item => ({ date: g.date, label: groupNameOf.get(g.groupId) ?? "" }))
      .sort(byDate);
    // Dauer je Fall (#40): „A-1: 25 Min, A-2: 25 Min“
    const shares = sv.caseShares
      .map((c) => ({ label: chiffreOf.get(c.patientId) ?? "", minutes: c.minutes }))
      .sort((a, b) => compareNatural(a.label, b.label))
      .map((c) => `${c.label}: ${c.minutes} Min`)
      .join(", ");
    return [
      sv.date,
      supervisorNameOf.get(sv.supervisorId) ?? "",
      SUPERVISION_KIND_LABELS[sv.kind],
      SUPERVISION_SETTING_LABELS[sv.setting],
      sv.durationMinutes,
      formatHours(sv.durationMinutes),
      describe(therapy),
      describe(groups),
      shares,
    ];
  });
  return toCsv(
    ["Datum", "Supervisor:in", "Art", "Setting", "Dauer (Minuten)", "Dauer (Stunden)", "Besprochene Sitzungen", "Besprochene Doppelstunden", "Dauer je Patient:in"],
    rows
  );
}

export function groupSessionsCsv(data: UserData): string {
  const groupNameOf = groupNameMap(data);
  const lookup = supervisionLookup(data.supervisionSessions, data.supervisors);
  const rows: CsvValue[][] = data.groupSessions.map((s) => {
    const refs = lookup.forGroupSession(s.id);
    return [
      s.date,
      groupNameOf.get(s.groupId) ?? "",
      GROUP_SESSION_STATUS_LABELS[s.status],
      s.childCount,
      s.countsTowardAmbulanzzeit,
      s.durationMinutes,
      formatHours(s.durationMinutes),
      s.notes,
      supervisionDates(refs),
      supervisorNames(refs),
    ];
  });
  return toCsv(
    [
      "Datum",
      "Gruppe",
      "Status",
      "Teilnehmende",
      "Zählt zur Ambulanzzeit",
      "Dauer (Minuten)",
      "Dauer (Stunden)",
      "Notiz",
      "Supervision am",
      "Supervisor:in",
    ],
    rows
  );
}

export function patientsCsv(data: UserData): string {
  const rows: CsvValue[][] = data.patients.map((p) => {
    const sessions = data.therapySessions.filter((s) => s.patientId === p.id);
    const minutes = sessions.reduce((total, s) => total + s.durationMinutes, 0);
    return [
      p.chiffre,
      THERAPY_TYPE_LABELS[p.therapyType],
      p.startDate,
      p.endDate,
      p.isActive,
      p.antragsdatum,
      p.genehmigungsdatum,
      p.beantragteStunden,
      p.sprechstundenAmbulanz,
      sessions.length,
      formatHours(minutes),
    ];
  });
  return toCsv(
    [
      "Chiffre",
      "Therapieart",
      "Beginn",
      "Ende",
      "Aktiv",
      "Antragsdatum",
      "Genehmigungsdatum",
      "Beantragte Behandlungsstunden",
      "Sprechstunden durch Ambulanzleitung",
      "Sitzungen (Anzahl)",
      "Sitzungen (Stunden)",
    ],
    rows
  );
}

// Ausgaben für die Steuererklärung (#65): je Supervision die Kosten wie auf der Finanzseite (SV-Einheiten à 50 Min mal
// Kosten je SV-Einheit der Supervisor:in, ohne hinterlegte Kosten 0). Beträge auf Cent gerundet; die Summenzeile addiert
// die gerundeten Beträge, damit sie in der Tabelle nachrechenbar ist. Mit `year` nur Supervisionen dieses Kalenderjahrs.
export function expensesCsv(data: UserData, options: CsvExportOptions = {}): string {
  const supervisorById = new Map(data.supervisors.map((s) => [s.id, s]));
  const euro = (value: number) => formatDecimal(value);
  const sessions = data.supervisionSessions.filter(
    (sv) => options.year === undefined || sv.date.startsWith(`${options.year}-`)
  );
  let totalCents = 0;
  const rows: CsvValue[][] = sessions.map((sv) => {
    const supervisor = supervisorById.get(sv.supervisorId);
    const costPerUnit = supervisor?.costPerHour ?? 0;
    const units = minutesToUnits(sv.durationMinutes);
    const cents = Math.round(units * costPerUnit * 100);
    totalCents += cents;
    return [
      sv.date,
      quarterOf(sv.date),
      supervisor?.name ?? "",
      SUPERVISION_KIND_LABELS[sv.kind],
      SUPERVISION_SETTING_LABELS[sv.setting],
      sv.durationMinutes,
      formatDecimal(units),
      euro(costPerUnit),
      euro(cents / 100),
    ];
  });
  rows.push(["Summe", "", "", "", "", "", "", "", euro(totalCents / 100)]);
  return toCsv(
    [
      "Datum",
      "Quartal",
      "Supervisor:in",
      "Art",
      "Setting",
      "Dauer (Minuten)",
      "SV-Einheiten",
      "Kosten je SV-Einheit (EUR)",
      "Betrag (EUR)",
    ],
    rows
  );
}

// Registry für den Route-Handler: URL-Segment → Dateiname und Aufbau. Whitelist statt dynamischem Zugriff.
// `byYear`: der Export nimmt ?jahr=JJJJ an und hängt das Jahr an den Dateinamen.
export const CSV_EXPORTS: Record<
  CsvExportKey,
  { fileStem: string; byYear?: boolean; build: (data: UserData, options: CsvExportOptions) => string }
> = {
  "therapy-sessions": { fileStem: "therapiesitzungen", build: therapySessionsCsv },
  supervisions: { fileStem: "supervisionen", build: supervisionsCsv },
  "group-sessions": { fileStem: "doppelstunden", build: groupSessionsCsv },
  patients: { fileStem: "patientinnen", build: patientsCsv },
  expenses: { fileStem: "ausgaben", byYear: true, build: expensesCsv },
};

// Kalenderjahr aus ?jahr=: genau vier Ziffern, sonst undefined (der Route-Handler antwortet dann mit 400).
export function parseExportYear(value: string): number | undefined {
  return /^\d{4}$/.test(value) ? Number(value) : undefined;
}

export function isCsvExportKey(value: string): value is CsvExportKey {
  return Object.hasOwn(CSV_EXPORTS, value);
}
