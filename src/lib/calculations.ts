import { parseISO } from "date-fns";
import {
  TherapySession,
  TherapySessionId,
  SupervisionSession,
  SupervisionSessionId,
  SupervisionSetting,
  Patient,
  PatientId,
  SupervisorId,
  GroupSession,
  SessionCategory,
} from "@/types";
import { UNIT_MINUTES } from "./constants";
import { CATEGORY_ORDER } from "./labels";
import type { Ausbildungsregeln, EbmStaffel } from "./ausbildungsregeln/model";
import { ebmStaffelFuer, ebmStufeFuer } from "./ausbildungsregeln/resolve";

// Minuten → Ausbildungseinheiten (Behandlungsstunden bzw. SV-Einheiten à UNIT_MINUTES). Die einzige Umrechnung im
// Code: alles, was hier „Hours“ heißt, sind diese Einheiten – keine Uhrzeit-Stunden (die gibt es nur im CSV-Export,
// csv.formatHours).
export function minutesToUnits(minutes: number): number {
  return minutes / UNIT_MINUTES;
}

// Anzeige-Rundung für Einheiten à 50 Min: eine Nachkommastelle (60 min = 1,2; 2,25 → 2,3). Nicht für Dokumente – der
// Nachweis rundet auf Hundertstel (nachweis.ts, nachweisUnits).
export function roundUnits(units: number): number {
  return Math.round(units * 10) / 10;
}

// Quartalsschlüssel „2026 Q3“ – Anzeige in Finanzen und Dashboard. parseISO statt new Date(string): lokale
// Mitternacht, damit der 1. Oktober auch westlich von UTC in Q4 landet (calculations-timezone.test.ts).
export function quarterOf(date: string): string {
  const d = parseISO(date);
  return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
}

// Reststunden bis zu einem Ziel aus dem Regelwerk (Behandlungsstunden, SV-Einheiten), auf Zehntel, nie negativ.
export function hoursRemaining(current: number, target: number): number {
  return Math.max(0, roundUnits(target - current));
}

// Wie viel Supervision fehlt jetzt, damit das Verhältnis wieder im Soll (1 : regeln.verhaeltnisWarnung) liegt?
// Aufgerundet auf Zehntel: 0,04 fehlende Stunden ergeben 0,1 – calculateRatio meldet dann schon „knapp“, der Hinweis
// darf nicht 0 zeigen.
export function supervisionHoursMissingForRatio(therapyHours: number, supervisionHours: number, regeln: Ausbildungsregeln): number {
  const missing = therapyHours / regeln.verhaeltnisWarnung - supervisionHours;
  return Math.max(0, Math.ceil(missing * 10 - 1e-9) / 10);
}

// Erst Minuten summieren, dann einmal umrechnen: 60 + 30 Min ergeben genau 1,8 statt 1,2 + 0,6 = 1,7999….
export function totalTherapyHours(sessions: TherapySession[]): number {
  return minutesToUnits(sessions.reduce((sum, s) => sum + s.durationMinutes, 0));
}

export function totalSupervisionHours(sessions: SupervisionSession[]): number {
  return minutesToUnits(sessions.reduce((sum, s) => sum + s.durationMinutes, 0));
}

// SV-Einheiten getrennt nach Setting – für Einzel und Gruppe gelten eigene Mindestanteile.
export function supervisionHoursBySetting(sessions: SupervisionSession[]): Record<SupervisionSetting, number> {
  return {
    einzel: totalSupervisionHours(sessions.filter((s) => s.setting === "einzel")),
    gruppe: totalSupervisionHours(sessions.filter((s) => s.setting === "gruppe")),
  };
}

// Vorgabe beim Erfassen: das Setting der letzten Supervision zu Einzeltherapien bei derselben Supervisor:in.
// Supervisionen von Gruppentherapien (Gruppenseite) zählen nicht – sie werden dort ohne Setting-Wahl gespeichert.
export function lastSettingBySupervisor(sessions: SupervisionSession[]): Record<string, SupervisionSetting> {
  const result: Record<string, SupervisionSetting> = {};
  const individual = sessions.filter((s) => s.kind === "individual");
  for (const sv of individual.sort((a, b) => a.date.localeCompare(b.date))) result[sv.supervisorId] = sv.setting;
  return result;
}

export function therapyHoursForPatient(
  sessions: TherapySession[],
  patientId: PatientId
): number {
  return totalTherapyHours(sessions.filter((s) => s.patientId === patientId));
}

// SV-Anrechnung je Fall: die Dauer einer Supervision verteilt sich gleich auf die besprochenen Fälle – 50 Min mit zwei
// Fällen ergeben je 25 Min, unabhängig davon, wie viele Sitzungen eines Falls zugeordnet sind. Erfasst wird die Dauer je
// Fall; gespeichert ist die Summe, die Teilung ergibt also wieder die Dauer je Fall.
export function supervisionHoursForPatient(
  supervisionSessions: SupervisionSession[],
  therapySessions: TherapySession[],
  patientId: PatientId
): number {
  const patientOf = new Map(therapySessions.map((s) => [s.id, s.patientId]));
  let totalMinutes = 0;
  for (const sv of supervisionSessions) {
    const cases = new Set(
      sv.linkedTherapySessionIds.map((id) => patientOf.get(id)).filter((p): p is PatientId => p !== undefined)
    );
    if (cases.has(patientId)) totalMinutes += sv.durationMinutes / cases.size;
  }
  return minutesToUnits(totalMinutes);
}

export interface RatioResult {
  therapyHours: number;
  supervisionHours: number;
  ratio: number; // therapy:supervision (e.g. 4.0 means 4:1)
  isOk: boolean; // true if ratio <= soll (enough supervision)
  status: "ok" | "warning" | "critical";
  soll: number; // Soll-Verhältnis 1 : soll, mit dem gerechnet wurde (regeln.verhaeltnisWarnung)
}

export function calculateRatio(therapyHours: number, supervisionHours: number, regeln: Ausbildungsregeln): RatioResult {
  const ratio = supervisionHours > 0 ? therapyHours / supervisionHours : Infinity;
  let status: RatioResult["status"] = "ok";
  if (ratio > regeln.verhaeltnisKritisch) status = "critical";
  else if (ratio > regeln.verhaeltnisWarnung) status = "warning";

  return {
    therapyHours: roundUnits(therapyHours),
    supervisionHours: roundUnits(supervisionHours),
    ratio: Math.round(ratio * 10) / 10,
    isOk: ratio <= regeln.verhaeltnisWarnung,
    status,
    soll: regeln.verhaeltnisWarnung,
  };
}

export function calculateOverallRatio(
  therapySessions: TherapySession[],
  supervisionSessions: SupervisionSession[],
  regeln: Ausbildungsregeln
): RatioResult {
  return calculateRatio(totalTherapyHours(therapySessions), totalSupervisionHours(supervisionSessions), regeln);
}

export function calculatePatientRatio(
  patient: Patient,
  therapySessions: TherapySession[],
  supervisionSessions: SupervisionSession[],
  regeln: Ausbildungsregeln
): RatioResult {
  return calculateRatio(
    therapyHoursForPatient(therapySessions, patient.id),
    supervisionHoursForPatient(supervisionSessions, therapySessions, patient.id),
    regeln
  );
}

export function getUnsupervisedSessions(
  therapySessions: TherapySession[],
  supervisionSessions: SupervisionSession[]
): TherapySession[] {
  const supervisedIds = new Set(
    supervisionSessions.flatMap((s) => s.linkedTherapySessionIds)
  );
  return therapySessions.filter((s) => !supervisedIds.has(s.id));
}

export interface SupervisionCase {
  patient: Patient;
  sessionIds: TherapySessionId[];
  openUnits: number;
  due: boolean;
}

// Supervision nach Fällen: je Patient:in die offenen Sitzungen (keiner Supervision zugeordnet) bis einschließlich
// `upTo` – spätere können in dieser Supervision nicht besprochen worden sein. „Fällig“ über dem Soll
// (1 : verhaeltnisWarnung Einheiten je Fall), bei 50-Min-Sitzungen also ab der fünften ohne Supervision.
export function supervisionCases(
  unsupervisedSessions: TherapySession[],
  patients: Patient[],
  upTo: string,
  regeln: Ausbildungsregeln
): SupervisionCase[] {
  const cases: SupervisionCase[] = [];
  for (const patient of patients) {
    const sessions = unsupervisedSessions
      .filter((s) => s.patientId === patient.id && s.date <= upTo)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (sessions.length === 0) continue;
    const openUnits = totalTherapyHours(sessions);
    cases.push({ patient, sessionIds: sessions.map((s) => s.id), openUnits, due: openUnits > regeln.verhaeltnisWarnung });
  }
  return cases.sort((a, b) => b.openUnits - a.openUnits || a.patient.chiffre.localeCompare(b.patient.chiffre));
}

// Markierung „SV fällig“ in Dashboard und Patient:innen-Liste – ohne Datumsgrenze, alle offenen Sitzungen zählen.
export function supervisionDuePatientIds(
  therapySessions: TherapySession[],
  supervisionSessions: SupervisionSession[],
  patients: Patient[],
  regeln: Ausbildungsregeln
): Set<PatientId> {
  const open = getUnsupervisedSessions(therapySessions, supervisionSessions);
  return new Set(
    supervisionCases(open, patients, "9999-12-31", regeln)
      .filter((c) => c.due)
      .map((c) => c.patient.id)
  );
}

// Beim Bearbeiten einer Supervision: welche Sitzungen dürfen ihr zugeordnet werden?
// Alle bis zum Datum der Supervision, die keiner anderen Supervision zugeordnet sind – spätere können darin nicht
// besprochen worden sein. Die eigenen Zuordnungen bleiben unabhängig vom Datum wählbar, damit man sie abwählen kann.
export function linkableTherapySessions(
  therapySessions: TherapySession[],
  supervisionSessions: SupervisionSession[],
  supervisionId: SupervisionSessionId,
  upTo: string
): TherapySession[] {
  const takenByOthers = new Set(
    supervisionSessions.filter((sv) => sv.id !== supervisionId).flatMap((sv) => sv.linkedTherapySessionIds)
  );
  const own = new Set(supervisionSessions.find((sv) => sv.id === supervisionId)?.linkedTherapySessionIds ?? []);
  return therapySessions.filter((s) => own.has(s.id) || (s.date <= upTo && !takenByOthers.has(s.id)));
}

// Doppelstunden: freie nur, wenn durchgeführt. Eigene Zuordnungen bleiben unabhängig vom Status
// wählbar – sonst wäre eine später auf „ausgefallen“/„geplant“ gesetzte Stunde unsichtbar und nicht abwählbar.
export function linkableGroupSessions(
  groupSessions: GroupSession[],
  supervisionSessions: SupervisionSession[],
  supervisionId: SupervisionSessionId
): GroupSession[] {
  const takenByOthers = new Set(
    supervisionSessions.filter((sv) => sv.id !== supervisionId).flatMap((sv) => sv.linkedGroupSessionIds)
  );
  const own = new Set(supervisionSessions.find((sv) => sv.id === supervisionId)?.linkedGroupSessionIds ?? []);
  return groupSessions.filter(
    (s) => (s.status === "durchgefuehrt" || own.has(s.id)) && !takenByOthers.has(s.id)
  );
}

// Financial calculations
export function calculateQuarterlyFinances(
  therapySessions: TherapySession[],
  supervisionSessions: SupervisionSession[],
  incomePerHour: number,
  supervisionCosts: Record<SupervisorId, number>
): { quarter: string; income: number; costs: number; profit: number }[] {
  const quarters: Record<string, { income: number; costs: number }> = {};

  for (const session of therapySessions) {
    const q = quarterOf(session.date);
    if (!quarters[q]) quarters[q] = { income: 0, costs: 0 };
    quarters[q].income += minutesToUnits(session.durationMinutes) * incomePerHour;
  }

  for (const session of supervisionSessions) {
    const q = quarterOf(session.date);
    if (!quarters[q]) quarters[q] = { income: 0, costs: 0 };
    const cost = supervisionCosts[session.supervisorId] || 0;
    quarters[q].costs += minutesToUnits(session.durationMinutes) * cost;
  }

  return Object.entries(quarters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, data]) => ({
      quarter,
      income: Math.round(data.income * 100) / 100,
      costs: Math.round(data.costs * 100) / 100,
      profit: Math.round((data.income - data.costs) * 100) / 100,
    }));
}

// Antrags-Kontingent in Behandlungsstunden à 50 Min (#51): beantragte Behandlungsstunden minus die Einheiten aller
// Behandlungssitzungen ab Genehmigungsdatum (sonst Antragsdatum) – eine 25-Minuten-Sitzung verbraucht 0,5, eine Doppelstunde 2. Probatorik
// und Bezugsperson zählen nicht dagegen, wohl aber weiterhin zu den persönlichen Behandlungsstunden (totalTherapyHours). Erst Minuten
// summieren, dann einmal umrechnen. Kann negativ werden: das Kontingent ist überzogen, das soll man sehen.
export function remainingContingentForPatient(
  patient: Patient,
  therapySessions: TherapySession[]
): number | null {
  if (!patient.antragsdatum || !patient.beantragteStunden) return null;
  // Behandlungsstunden des Antrags zählen ab Genehmigung durch die Kasse (#66); ohne Genehmigungsdatum ab Antragsdatum.
  const ab = patient.genehmigungsdatum ?? patient.antragsdatum;

  const usedMinutes = therapySessions
    .filter(
      (s) =>
        s.patientId === patient.id &&
        s.category === "behandlung" &&
        s.date >= ab
    )
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  return patient.beantragteStunden - minutesToUnits(usedMinutes);
}

export function bezugspersonenStundenForPatient(
  therapySessions: TherapySession[],
  patientId: PatientId
): number {
  return totalTherapyHours(
    therapySessions.filter(
      (s) => s.patientId === patientId && s.category === "bezugsperson"
    )
  );
}

export function bezugspersonenStundenTotal(therapySessions: TherapySession[]): number {
  return totalTherapyHours(
    therapySessions.filter((s) => s.category === "bezugsperson")
  );
}

export function sessionHoursByCategory(therapySessions: TherapySession[]): Record<SessionCategory, number> {
  return Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, totalTherapyHours(therapySessions.filter((s) => s.category === c))])
  ) as Record<SessionCategory, number>;
}

// EBM-Honorar einer Doppelstunde (#8): Staffel nach dem Datum der Doppelstunde (spätester Gültigkeitsbeginn bis zu diesem
// Tag, vor der ältesten die älteste), Stufe nach Kinderzahl – darunter kein Honorar, darüber die größte Stufe.
export function getEbmFee(childCount: number, date: string, ebmStaffeln: EbmStaffel[]): { total: number; share: number } | null {
  return ebmStufeFuer(childCount, ebmStaffelFuer(date, ebmStaffeln));
}

export interface GroupProgress {
  durchgefuehrt: number;
  ausgefallen: number;
  urlaub: number;
  geplant: number;
  ambulanzzeitCount: number;
}

export function groupSessionCounts(groupSessions: GroupSession[]): GroupProgress {
  return {
    durchgefuehrt: groupSessions.filter((s) => s.status === "durchgefuehrt").length,
    ausgefallen: groupSessions.filter((s) => s.status === "ausgefallen").length,
    urlaub: groupSessions.filter((s) => s.status === "urlaub").length,
    geplant: groupSessions.filter((s) => s.status === "geplant").length,
    ambulanzzeitCount: groupSessions.filter(
      (s) => s.status === "durchgefuehrt" && s.countsTowardAmbulanzzeit
    ).length,
  };
}

export function ambulanzzeitRemaining(groupSessions: GroupSession[], regeln: Ausbildungsregeln): number {
  const { ambulanzzeitCount } = groupSessionCounts(groupSessions);
  return regeln.gruppeAmbulanzzeitZiel - ambulanzzeitCount;
}

export function groupIncomeTotal(groupSessions: GroupSession[], ebmStaffeln: EbmStaffel[]): number {
  const income = groupSessions
    .filter((s) => s.status === "durchgefuehrt" && s.childCount !== null)
    .reduce((sum, s) => sum + (getEbmFee(s.childCount!, s.date, ebmStaffeln)?.share ?? 0), 0);
  return Math.round(income * 100) / 100;
}

// Wie calculateQuarterlyFinances, aber mit Gruppen-Einnahmen (EBM-Honorar-Anteil)
// zusätzlich pro Quartal eingerechnet. Eigene Funktion statt geänderter Signatur,
// damit calculateQuarterlyFinances fuer bestehende Aufrufer/Tests stabil bleibt.
export function calculateQuarterlyFinancesWithGroups(
  therapySessions: TherapySession[],
  supervisionSessions: SupervisionSession[],
  groupSessions: GroupSession[],
  incomePerHour: number,
  supervisionCosts: Record<SupervisorId, number>,
  ebmStaffeln: EbmStaffel[]
): { quarter: string; income: number; costs: number; profit: number }[] {
  const base = calculateQuarterlyFinances(
    therapySessions,
    supervisionSessions,
    incomePerHour,
    supervisionCosts
  );
  const quarters: Record<string, { income: number; costs: number }> = {};
  for (const q of base) {
    quarters[q.quarter] = { income: q.income, costs: q.costs };
  }

  for (const session of groupSessions) {
    if (session.status !== "durchgefuehrt" || session.childCount === null) continue;
    const fee = getEbmFee(session.childCount, session.date, ebmStaffeln)?.share ?? 0;
    const q = quarterOf(session.date);
    if (!quarters[q]) quarters[q] = { income: 0, costs: 0 };
    quarters[q].income += fee;
  }

  return Object.entries(quarters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, data]) => ({
      quarter,
      income: Math.round(data.income * 100) / 100,
      costs: Math.round(data.costs * 100) / 100,
      profit: Math.round((data.income - data.costs) * 100) / 100,
    }));
}

// Gesamteinnahmen und -kosten der Finanzseite: Gruppen-Honorar (EBM-Staffel nach Datum) plus Behandlungsstunden mal
// Honorarsatz, Supervisionseinheiten mal Satz der Supervisor:in. Einmal am Ende auf Cent gerundet.
export function financeTotals(
  therapySessions: TherapySession[],
  supervisionSessions: SupervisionSession[],
  groupSessions: GroupSession[],
  incomePerHour: number,
  supervisionCosts: Record<SupervisorId, number>,
  ebmStaffeln: EbmStaffel[]
): { totalIncome: number; totalCosts: number } {
  let totalIncome = groupIncomeTotal(groupSessions, ebmStaffeln);
  for (const session of therapySessions) {
    totalIncome += minutesToUnits(session.durationMinutes) * incomePerHour;
  }

  let totalCosts = 0;
  for (const session of supervisionSessions) {
    const cost = supervisionCosts[session.supervisorId as SupervisorId] || 0;
    totalCosts += minutesToUnits(session.durationMinutes) * cost;
  }

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalCosts: Math.round(totalCosts * 100) / 100,
  };
}
