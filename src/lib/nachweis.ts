import type { SessionCategory, SupervisionKind, SupervisionSetting } from "@/types";
import type { UserData } from "./db/user-data";
import { calculateRatio, minutesToUnits, type RatioResult } from "./calculations";
import { compareNatural } from "./collation";
import { CATEGORY_ORDER } from "./labels";
import { NotFoundError } from "./errors";
import { supervisionLookup, type SupervisionRef } from "./supervision-lookup";
import type { Ausbildungsregeln, RegelFeld, Regelwerk } from "./ausbildungsregeln/model";

export interface NachweisFilter {
  from: string; // YYYY-MM-DD, inklusive
  to: string; // YYYY-MM-DD, inklusive
  supervisorId: string | null;
}

export interface NachweisTherapyRow {
  id: string;
  date: string;
  chiffre: string;
  category: SessionCategory;
  durationMinutes: number;
  supervisions: SupervisionRef[];
}

export interface NachweisSupervisionRow {
  id: string;
  date: string;
  supervisorName: string;
  kind: SupervisionKind;
  setting: SupervisionSetting;
  durationMinutes: number;
  linkedTherapySessions: { date: string; chiffre: string }[];
  linkedGroupSessions: { date: string; groupName: string }[];
}

export interface NachweisGroupSessionRow {
  id: string;
  date: string;
  groupName: string;
  durationMinutes: number;
  childCount: number | null;
  countsTowardAmbulanzzeit: boolean;
  supervisions: SupervisionRef[];
}

// *Units = Anzahl der Einträge, *Hours = Ausbildungseinheiten à 50 Min (Behandlungsstunden bzw. SV-Einheiten), *Minutes = Summe der Minuten.
export interface NachweisTotals {
  therapyUnits: number;
  therapyMinutes: number;
  therapyHours: number;
  hoursByCategory: Record<SessionCategory, number>;
  supervisionUnits: number;
  supervisionMinutes: number;
  supervisionHours: number;
  groupSessionUnits: number;
  groupSessionMinutes: number;
  groupSessionHours: number;
  ratio: RatioResult;
}

// Sichtmodell für die spätere Druckseite (Unterschriftsfelder, Kopf und Formatierung sind UI-Sache).
export interface Nachweis {
  period: { from: string; to: string };
  pia: { name: string; email: string };
  supervisor: { id: string; name: string } | null;
  generatedAt: string;
  // Regeln, mit denen gerechnet wurde (Soll-Verhältnis, Behandlungsstunden-Ziel im Dokument), und die persönlich
  // festgelegten Felder (Kennzeichnung im Dokument, #8).
  regeln: Ausbildungsregeln;
  abweichend: RegelFeld[];
  therapySessions: NachweisTherapyRow[];
  supervisionSessions: NachweisSupervisionRow[];
  groupSessions: NachweisGroupSessionRow[];
  totals: NachweisTotals;
}

// Minuten → Einheiten à 50 Min (minutesToUnits) mit zwei Nachkommastellen – der Nachweis ist ein Dokument: „1,20“.
// Bewusst nicht exportiert und anders benannt als calculations.roundUnits (Zehntel für Kacheln).
function nachweisUnits(minutes: number): number {
  return Math.round(minutesToUnits(minutes) * 100) / 100;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const byDateThen = <T extends { date: string }>(key: (row: T) => string) => (a: T, b: T) =>
  a.date.localeCompare(b.date) || compareNatural(key(a), key(b));

function defined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

// Reine Funktion. Ohne Supervisor:in: alles, dessen Datum im Zeitraum liegt. Mit Supervisor:in: deren
// Supervisionen im Zeitraum und genau die Sitzungen und Doppelstunden, die in diesen Supervisionen
// besprochen wurden – unabhängig vom eigenen Datum, damit jede Zeile an einer gelisteten Supervision
// hängt und das Dokument in sich geschlossen ist. Doppelstunden zählen nur, wenn sie durchgeführt wurden.
// Notizen gehören nicht in den Nachweis.
export function buildNachweis(data: UserData, filter: NachweisFilter, regelwerk: Regelwerk, now: Date = new Date()): Nachweis {
  const inPeriod = (date: string) => date >= filter.from && date <= filter.to;
  const chiffreOf = new Map(data.patients.map((p): [string, string] => [p.id, p.chiffre]));
  const groupNameOf = new Map(data.groups.map((g): [string, string] => [g.id, g.name]));
  const supervisorNameOf = new Map(data.supervisors.map((s): [string, string] => [s.id, s.name]));
  const therapyById = new Map(data.therapySessions.map((s): [string, (typeof data.therapySessions)[number]] => [s.id, s]));
  const groupSessionById = new Map(data.groupSessions.map((s): [string, (typeof data.groupSessions)[number]] => [s.id, s]));
  const lookup = supervisionLookup(data.supervisionSessions, data.supervisors);

  const supervisorId = filter.supervisorId;
  let supervisor: Nachweis["supervisor"] = null;
  if (supervisorId !== null) {
    const name = supervisorNameOf.get(supervisorId);
    if (name === undefined) throw new NotFoundError("Supervisor:in");
    supervisor = { id: supervisorId, name };
  }
  const restricted = supervisorId !== null;

  const supervisions = data.supervisionSessions.filter(
    (sv) => inPeriod(sv.date) && (supervisorId === null || sv.supervisorId === supervisorId)
  );
  const listedIds = new Set<string>(supervisions.map((sv) => sv.id));
  const discussedTherapy = new Set<string>(supervisions.flatMap((sv) => sv.linkedTherapySessionIds));
  const discussedGroup = new Set<string>(supervisions.flatMap((sv) => sv.linkedGroupSessionIds));
  const refsFor = (refs: SupervisionRef[]) => (restricted ? refs.filter((r) => listedIds.has(r.id)) : refs);

  const therapyRows: NachweisTherapyRow[] = data.therapySessions
    .filter((s) => (restricted ? discussedTherapy.has(s.id) : inPeriod(s.date)))
    .map((s) => ({
      id: s.id,
      date: s.date,
      chiffre: chiffreOf.get(s.patientId) ?? "",
      category: s.category,
      durationMinutes: s.durationMinutes,
      supervisions: refsFor(lookup.forTherapySession(s.id)),
    }))
    .sort(byDateThen((r) => r.chiffre));

  const supervisionRows: NachweisSupervisionRow[] = supervisions
    .map((sv) => ({
      id: sv.id,
      date: sv.date,
      supervisorName: supervisorNameOf.get(sv.supervisorId) ?? "",
      kind: sv.kind,
      setting: sv.setting,
      durationMinutes: sv.durationMinutes,
      linkedTherapySessions: sv.linkedTherapySessionIds
        .map((id) => therapyById.get(id))
        .filter(defined)
        .map((s) => ({ date: s.date, chiffre: chiffreOf.get(s.patientId) ?? "" }))
        .sort(byDateThen((r) => r.chiffre)),
      // Nur durchgeführte Doppelstunden – wie groupRows und die Summen (#41): eine ausgefallene Stunde, die
      // in einer Supervision besprochen wurde, gehört nicht in den Nachweis.
      linkedGroupSessions: sv.linkedGroupSessionIds
        .map((id) => groupSessionById.get(id))
        .filter(defined)
        .filter((s) => s.status === "durchgefuehrt")
        .map((s) => ({ date: s.date, groupName: groupNameOf.get(s.groupId) ?? "" }))
        .sort(byDateThen((r) => r.groupName)),
    }))
    .sort(byDateThen((r) => r.supervisorName));

  const groupRows: NachweisGroupSessionRow[] = data.groupSessions
    .filter((s) => s.status === "durchgefuehrt" && (restricted ? discussedGroup.has(s.id) : inPeriod(s.date)))
    .map((s) => ({
      id: s.id,
      date: s.date,
      groupName: groupNameOf.get(s.groupId) ?? "",
      durationMinutes: s.durationMinutes,
      childCount: s.childCount,
      countsTowardAmbulanzzeit: s.countsTowardAmbulanzzeit,
      supervisions: refsFor(lookup.forGroupSession(s.id)),
    }))
    .sort(byDateThen((r) => r.groupName));

  const therapyMinutes = sum(therapyRows.map((r) => r.durationMinutes));
  const supervisionMinutes = sum(supervisionRows.map((r) => r.durationMinutes));
  const groupSessionMinutes = sum(groupRows.map((r) => r.durationMinutes));
  const hoursFor = (category: SessionCategory) =>
    nachweisUnits(sum(therapyRows.filter((r) => r.category === category).map((r) => r.durationMinutes)));

  return {
    period: { from: filter.from, to: filter.to },
    pia: { name: data.account.name, email: data.account.email },
    supervisor,
    generatedAt: now.toISOString(),
    regeln: { ...regelwerk.regeln },
    abweichend: [...regelwerk.abweichend],
    therapySessions: therapyRows,
    supervisionSessions: supervisionRows,
    groupSessions: groupRows,
    totals: {
      therapyUnits: therapyRows.length,
      therapyMinutes,
      therapyHours: nachweisUnits(therapyMinutes),
      hoursByCategory: Object.fromEntries(CATEGORY_ORDER.map((c) => [c, hoursFor(c)])) as Record<SessionCategory, number>,
      supervisionUnits: supervisionRows.length,
      supervisionMinutes,
      supervisionHours: nachweisUnits(supervisionMinutes),
      groupSessionUnits: groupRows.length,
      groupSessionMinutes,
      groupSessionHours: nachweisUnits(groupSessionMinutes),
      ratio: calculateRatio(minutesToUnits(therapyMinutes), minutesToUnits(supervisionMinutes), regelwerk.regeln),
    },
  };
}
