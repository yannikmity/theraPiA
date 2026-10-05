import type { UserData } from "../../db/user-data";
import type { Nachweis, NachweisFilter } from "../../nachweis";
import { forecastDisplay, type QuarterForecast, type QuarterForecastInput } from "../../quarter-forecast";
import {
  groupSessionCounts,
  hoursRemaining,
  sessionHoursByCategory,
  totalSupervisionHours,
  totalTherapyHours,
  type RatioResult,
} from "../../calculations";
import {
  newGroupId,
  newGroupSessionId,
  newPatientId,
  newSupervisionSessionId,
  newSupervisorId,
  newTherapySessionId,
  type FinancialSettings,
  type GroupSession,
  type GroupSessionStatus,
  type Patient,
  type SessionCategory,
  type SupervisionSession,
  type SupervisorId,
  type TherapySession,
} from "@/types";

// „Vorher = Nachher“ (#8): feste, fiktive Daten und eine Kennzahlen-Funktion über Dashboard, Prognose, Finanzen, Gruppen
// und Nachweis. Task 1 hat die Ausgabe mit den alten Code-Konstanten als Datei-Snapshot festgehalten. Danach ändert sich
// nur die RegelApi (wie die Rechenfunktionen ihre Regeln bekommen) – nie diese Datei und nie der Snapshot.

export const VN_HEUTE = "2026-08-16";
export const VN_JETZT = new Date("2026-08-16T10:00:00.000Z");
export const VN_ZEITRAUM: NachweisFilter = { from: "2026-04-01", to: "2026-09-30", supervisorId: null };

const t = (id: string, patient: string, date: string, durationMinutes: number, category: SessionCategory = "behandlung"): TherapySession => ({
  id: newTherapySessionId(id),
  patientId: newPatientId(patient),
  date,
  durationMinutes,
  notes: "",
  category,
});
const sv = (id: string, supervisor: string, date: string, durationMinutes: number, therapy: string[], groups: string[] = []): SupervisionSession => ({
  id: newSupervisionSessionId(id),
  supervisorId: newSupervisorId(supervisor),
  date,
  durationMinutes,
  kind: groups.length > 0 ? "group" : "individual",
  setting: "einzel",
  linkedTherapySessionIds: therapy.map(newTherapySessionId),
  linkedGroupSessionIds: groups.map(newGroupSessionId),
});
const g = (id: string, date: string, status: GroupSessionStatus, childCount: number | null, countsTowardAmbulanzzeit = true): GroupSession => ({
  id: newGroupSessionId(id),
  groupId: newGroupId("g-1"),
  date,
  status,
  childCount,
  countsTowardAmbulanzzeit,
  durationMinutes: 100,
  notes: "",
});
const p = (id: string, chiffre: string, antragsdatum: string | null, beantragteStunden: number | null): Patient => ({
  id: newPatientId(id),
  chiffre,
  therapyType: "langzeittherapie",
  startDate: "2026-04-01",
  endDate: null,
  isActive: true,
  createdAt: "2026-04-01T08:00:00.000Z",
  antragsdatum,
  beantragteStunden,
  genehmigungsdatum: null,
  sprechstundenAmbulanz: 0,
});

// Drei Patient:innen mit Verhältnis „passt“ (V-2), „knapp“ (V-3) und „Supervision fehlt“ (V-1); Sitzungen über zwei
// Quartale, eine nach „heute“ (zählt in der Prognose als schon eingetragen); Doppelstunden mit 2 (kein Honorar), 3, 5,
// 7, 9 und 12 Kindern (über der größten Stufe), ausgefallen, Urlaub und geplant.
export function vorherNachherDaten(): { data: UserData; settings: FinancialSettings } {
  const data: UserData = {
    account: { id: "u-vn", email: "vn@example.com", name: "PiA Vorher-Nachher", role: "pia", createdAt: "2026-04-01T08:00:00.000Z" },
    patients: [p("p-1", "V-1", "2026-04-10", 24), p("p-2", "V-2", null, null), p("p-3", "V-3", "2026-07-01", 12)],
    supervisors: [
      { id: newSupervisorId("s-1"), name: "Supervision Eins", costPerHour: 90, isActive: true },
      { id: newSupervisorId("s-2"), name: "Supervision Zwei", costPerHour: 80, isActive: true },
    ],
    therapySessions: [
      t("t-01", "p-1", "2026-04-07", 50, "probatorik"),
      t("t-02", "p-1", "2026-04-14", 50),
      t("t-03", "p-1", "2026-04-21", 60),
      t("t-04", "p-1", "2026-05-05", 50),
      t("t-05", "p-2", "2026-05-12", 25, "bezugsperson"),
      t("t-06", "p-2", "2026-06-02", 100),
      t("t-07", "p-2", "2026-06-30", 50),
      t("t-08", "p-3", "2026-07-01", 50, "probatorik"),
      t("t-09", "p-3", "2026-07-08", 50),
      t("t-10", "p-3", "2026-07-22", 50),
      t("t-11", "p-1", "2026-08-04", 50),
      t("t-12", "p-2", "2026-08-11", 50),
      t("t-13", "p-3", "2026-08-12", 50),
      t("t-14", "p-1", "2026-08-20", 50),
    ],
    supervisionSessions: [
      sv("sv-1", "s-1", "2026-04-28", 60, ["t-01", "t-02", "t-03"]),
      sv("sv-2", "s-2", "2026-06-10", 70, ["t-06"]),
      sv("sv-3", "s-1", "2026-07-15", 90, [], ["gs-2", "gs-4"]),
      sv("sv-4", "s-1", "2026-08-13", 45, ["t-08"]),
    ],
    groups: [
      { id: newGroupId("g-1"), name: "Gruppe Beispiel", startDate: "2026-04-01", plannedSessionCount: 20, avgKids: 6, isActive: true, createdAt: "2026-04-01T08:00:00.000Z" },
    ],
    groupSessions: [
      g("gs-1", "2026-04-09", "durchgefuehrt", 2),
      g("gs-2", "2026-04-16", "durchgefuehrt", 3),
      g("gs-3", "2026-05-07", "durchgefuehrt", 5, false),
      g("gs-4", "2026-06-18", "durchgefuehrt", 9),
      g("gs-5", "2026-07-02", "durchgefuehrt", 12),
      g("gs-6", "2026-07-09", "ausgefallen", null),
      g("gs-7", "2026-07-16", "urlaub", null),
      g("gs-8", "2026-08-06", "durchgefuehrt", 7),
      g("gs-9", "2026-09-03", "geplant", 9),
    ],
    financialSettings: { incomePerHour: 85 },
  };
  const settings: FinancialSettings = {
    incomePerHour: 85,
    supervisionCosts: { [newSupervisorId("s-1")]: 90, [newSupervisorId("s-2")]: 80 } as Record<SupervisorId, number>,
    plannedSessionsPerWeek: null,
  };
  return { data, settings };
}

type QuarterRow = { quarter: string; income: number; costs: number; profit: number };

// Einzige Nahtstelle zur Umstellung (#8): Task 1 bindet die alten Funktionen mit Konstanten, spätere Tasks dasselbe
// Verhalten über das Regelwerk.
export interface RegelApi {
  ziele: { behandlungsstunden: number; svEinheiten: number; gruppeDoppelstunden: number; gruppeAmbulanzzeit: number };
  calculateRatio(therapyHours: number, supervisionHours: number): RatioResult;
  calculateOverallRatio(therapy: TherapySession[], supervision: SupervisionSession[]): RatioResult;
  calculatePatientRatio(patient: Patient, therapy: TherapySession[], supervision: SupervisionSession[]): RatioResult;
  supervisionHoursMissingForRatio(therapyHours: number, supervisionHours: number): number;
  ambulanzzeitRemaining(groupSessions: GroupSession[]): number;
  getEbmFee(childCount: number, date: string): { total: number; share: number } | null;
  groupIncomeTotal(groupSessions: GroupSession[]): number;
  calculateQuarterlyFinancesWithGroups(
    therapy: TherapySession[],
    supervision: SupervisionSession[],
    groupSessions: GroupSession[],
    incomePerHour: number,
    supervisionCosts: Record<SupervisorId, number>
  ): QuarterRow[];
  quarterForecast(input: Omit<QuarterForecastInput, "ebmStaffeln">): QuarterForecast;
  buildNachweis(data: UserData, filter: NachweisFilter, now: Date): Nachweis;
}

// Nur die Felder, die es vor #8 gab – neue Felder (RatioResult.soll, Nachweis.regeln …) gehören nicht zum Vergleich.
const ratioVorher = (r: RatioResult) => ({
  therapyHours: r.therapyHours,
  supervisionHours: r.supervisionHours,
  ratio: r.ratio,
  isOk: r.isOk,
  status: r.status,
});
const nachweisVorher = (n: Nachweis) => ({
  period: n.period,
  pia: n.pia,
  supervisor: n.supervisor,
  generatedAt: n.generatedAt,
  therapySessions: n.therapySessions,
  supervisionSessions: n.supervisionSessions,
  groupSessions: n.groupSessions,
  totals: { ...n.totals, ratio: ratioVorher(n.totals.ratio) },
});

const GRENZFAELLE: [number, number][] = [
  [0, 0],
  [4, 1],
  [4.5, 1],
  [4.04, 1],
  [5, 1],
  [5.04, 1],
  [5.1, 1],
  [6, 1],
  [10, 2.46],
  [3.333, 1.111],
  [10, 0],
];
const KINDERZAHLEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 30];

export function berechneKennzahlen(api: RegelApi) {
  const { data, settings } = vorherNachherDaten();
  const { therapySessions: ts, supervisionSessions: ss, groupSessions: gs } = data;
  const therapy = totalTherapyHours(ts);
  const supervision = totalSupervisionHours(ss);
  const forecast = api.quarterForecast({ therapySessions: ts, supervisionSessions: ss, groupSessions: gs, settings, today: VN_HEUTE });
  return {
    ziele: api.ziele,
    dashboard: {
      behandlungsstunden: therapy,
      svEinheiten: supervision,
      restBehandlungsstunden: hoursRemaining(therapy, api.ziele.behandlungsstunden),
      restSvEinheiten: hoursRemaining(supervision, api.ziele.svEinheiten),
      verhaeltnis: ratioVorher(api.calculateOverallRatio(ts, ss)),
      fehlendeSupervision: api.supervisionHoursMissingForRatio(therapy, supervision),
      jePatientin: data.patients.map((pt) => ({ chiffre: pt.chiffre, ...ratioVorher(api.calculatePatientRatio(pt, ts, ss)) })),
      kategorien: sessionHoursByCategory(ts),
      gruppe: groupSessionCounts(gs),
      ambulanzzeitRest: api.ambulanzzeitRemaining(gs),
    },
    grenzfaelle: GRENZFAELLE.map(([a, b]) => ({
      therapie: a,
      supervision: b,
      ...ratioVorher(api.calculateRatio(a, b)),
      fehlt: api.supervisionHoursMissingForRatio(a, b),
    })),
    ebm: KINDERZAHLEN.map((kinder) => ({ kinder, honorar: api.getEbmFee(kinder, "2026-05-01") })),
    finanzen: {
      quartale: api.calculateQuarterlyFinancesWithGroups(ts, ss, gs, settings.incomePerHour, settings.supervisionCosts),
      gruppenHonorar: api.groupIncomeTotal(gs),
    },
    prognose: { forecast, anzeige: forecastDisplay(forecast) },
    nachweis: [
      nachweisVorher(api.buildNachweis(data, VN_ZEITRAUM, VN_JETZT)),
      nachweisVorher(api.buildNachweis(data, { ...VN_ZEITRAUM, supervisorId: "s-1" }, VN_JETZT)),
    ],
  };
}

// Stabile Textform für Datei-Snapshots (Infinity wird wie in JSON üblich zu null).
export function alsSnapshot(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
