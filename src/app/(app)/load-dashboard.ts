import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  getPatients,
  getTherapySessions,
  getSupervisionSessions,
  getGroupSessions,
  getGroups,
  getFinancialSettings,
} from "@/lib/db/index";
import {
  totalTherapyHours,
  totalSupervisionHours,
  calculateOverallRatio,
  calculatePatientRatio,
  sessionHoursByCategory,
  groupSessionCounts,
  ambulanzzeitRemaining,
  getUnsupervisedSessions,
  supervisionDuePatientIds,
  supervisionHoursBySetting,
  remainingContingentForPatient,
  remainingBezugspersonContingentForPatient,
} from "@/lib/calculations";
import { quarterForecast } from "@/lib/quarter-forecast";
import { todayIso } from "@/lib/dates";
import { ANTRAG_ERINNERUNG_AB_STUNDEN, DASHBOARD_RECENT_ENTRIES } from "@/lib/constants";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";

// Laden, Rechnen und Formatieren des Dashboards (#6) an einer Stelle: die Seite ruft das im try, damit auch ein
// Formatierungsfehler (z. B. ungültiges Datum) als Meldung endet statt auf der Standard-Fehlerseite (#56). Das JSX
// der Seite rechnet und formatiert nichts mehr selbst. „Heute“ ist der Kalendertag in Europe/Berlin (todayIso).
// Eigene Datei, weil page.tsx außer dem Default-Export nur die von Next erlaubten Exporte haben darf.
export async function loadDashboard() {
  const [patients, therapySessions, supervisionSessions, groupSessions, groups, settings, regelwerk] = await Promise.all([
    getPatients(),
    getTherapySessions(),
    getSupervisionSessions(),
    getGroupSessions(),
    getGroups(),
    getFinancialSettings(),
    getCurrentRegelwerk(),
  ]);
  // Supervision der Gruppenfachkunde (Gruppentherapie) zählt gesondert und nicht zu den SV-Einheiten der
  // Einzeltherapie, ihrem Ziel und dem Verhältnis zu den Behandlungsstunden (Pilot-Feedback).
  const einzelSupervisionen = supervisionSessions.filter((s) => s.kind === "individual");
  const gruppenSupervisionen = supervisionSessions.filter((s) => s.kind === "group");
  const { regeln } = regelwerk;
  const today = todayIso();

  // Letzte Einträge – jeder verlinkt dorthin, wo er bearbeitet werden kann.
  const recentEntries = [
    ...therapySessions.map((s) => ({
      key: `t-${s.id}`,
      type: "therapie" as const,
      href: `/patients/${s.patientId}`,
      date: s.date,
      duration: s.durationMinutes,
      patientId: s.patientId as string | null,
    })),
    ...supervisionSessions.map((s) => ({
      key: `s-${s.id}`,
      type: "supervision" as const,
      href: "/supervision",
      date: s.date,
      duration: s.durationMinutes,
      patientId: null as string | null,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, DASHBOARD_RECENT_ENTRIES)
    // Chiffre erst nach dem Kürzen nachschlagen: nur für die angezeigten Einträge statt für alle Sitzungen.
    .map(({ patientId, ...entry }) => ({
      ...entry,
      label: patientId === null ? "Supervision" : patients.find((p) => p.id === patientId)?.chiffre || "Unbekannt",
      dateLabel: format(parseISO(entry.date), "dd. MMM yyyy", { locale: de }),
    }));

  const activePatients = patients.filter((p) => p.isActive);
  const due = supervisionDuePatientIds(therapySessions, supervisionSessions, activePatients, regeln);

  return {
    settings,
    regeln,
    therapyH: totalTherapyHours(therapySessions),
    supervisionH: totalSupervisionHours(einzelSupervisionen),
    supervisionBySetting: supervisionHoursBySetting(einzelSupervisionen),
    overallRatio: calculateOverallRatio(therapySessions, einzelSupervisionen, regeln),
    groupSupervisionH: totalSupervisionHours(gruppenSupervisionen),
    activeGroups: groups.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name })),
    // Erinnerung: Antrags-Kontingent fast aufgebraucht – neu beantragen oder Abschluss planen.
    antragErinnerungen: activePatients.flatMap((patient) => {
      const behandlung = remainingContingentForPatient(patient, therapySessions);
      const bezugsperson = remainingBezugspersonContingentForPatient(patient, therapySessions);
      // Knapp: schon etwas verbraucht und höchstens 5 Stunden bzw. ein Fünftel des Kontingents übrig – kleine
      // Kontingente (z. B. 3 Bezugspersonenstunden) melden sich so nicht schon am ersten Tag.
      const knapp = (rest: number | null, beantragt: number | null) =>
        rest !== null &&
        beantragt !== null &&
        rest < beantragt &&
        rest <= Math.min(ANTRAG_ERINNERUNG_AB_STUNDEN, Math.ceil(beantragt / 5));
      const b = knapp(behandlung, patient.beantragteStunden) ? behandlung : null;
      const bp = knapp(bezugsperson, patient.beantragteBezugspersonStunden) ? bezugsperson : null;
      if (b === null && bp === null) return [];
      return [{ patient, behandlung: b, bezugsperson: bp }];
    }),
    categoryHours: sessionHoursByCategory(therapySessions),
    unsupervisedCount: getUnsupervisedSessions(therapySessions, supervisionSessions).length,
    // Prognose realistisch nach dem Schnitt der letzten Wochen (Pilot-Feedback), nicht nach der Planung aus Finanzen.
    // Die Planung erscheint auf der Karte nur zum Vergleich.
    forecast: quarterForecast({
      therapySessions,
      supervisionSessions,
      groupSessions,
      settings: { ...settings, plannedSessionsPerWeek: null },
      today,
      ebmStaffeln: regelwerk.ebmStaffeln,
    }),
    forecastMitPlanung:
      settings.plannedSessionsPerWeek === null
        ? null
        : quarterForecast({ therapySessions, supervisionSessions, groupSessions, settings, today, ebmStaffeln: regelwerk.ebmStaffeln }),
    groupCounts: groupSessionCounts(groupSessions),
    ambulanzzeitLeft: ambulanzzeitRemaining(groupSessions, regeln),
    recentEntries,
    patientRatios: activePatients.map((patient) => ({
      patient,
      ratio: calculatePatientRatio(patient, therapySessions, supervisionSessions, regeln),
      due: due.has(patient.id),
    })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
