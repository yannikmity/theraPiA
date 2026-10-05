import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  getPatients,
  getTherapySessions,
  getSupervisionSessions,
  getGroupSessions,
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
} from "@/lib/calculations";
import { quarterForecast } from "@/lib/quarter-forecast";
import { todayIso } from "@/lib/dates";
import { DASHBOARD_RECENT_ENTRIES } from "@/lib/constants";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";

// Laden, Rechnen und Formatieren des Dashboards (#6) an einer Stelle: die Seite ruft das im try, damit auch ein
// Formatierungsfehler (z. B. ungültiges Datum) als Meldung endet statt auf der Standard-Fehlerseite (#56). Das JSX
// der Seite rechnet und formatiert nichts mehr selbst. „Heute“ ist der Kalendertag in Europe/Berlin (todayIso).
// Eigene Datei, weil page.tsx außer dem Default-Export nur die von Next erlaubten Exporte haben darf.
export async function loadDashboard() {
  const [patients, therapySessions, supervisionSessions, groupSessions, settings, regelwerk] = await Promise.all([
    getPatients(),
    getTherapySessions(),
    getSupervisionSessions(),
    getGroupSessions(),
    getFinancialSettings(),
    getCurrentRegelwerk(),
  ]);
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
      label: patients.find((p) => p.id === s.patientId)?.chiffre || "Unbekannt",
    })),
    ...supervisionSessions.map((s) => ({
      key: `s-${s.id}`,
      type: "supervision" as const,
      href: "/supervision",
      date: s.date,
      duration: s.durationMinutes,
      label: "Supervision",
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, DASHBOARD_RECENT_ENTRIES)
    .map((entry) => ({ ...entry, dateLabel: format(parseISO(entry.date), "dd. MMM yyyy", { locale: de }) }));

  const activePatients = patients.filter((p) => p.isActive);
  const due = supervisionDuePatientIds(therapySessions, supervisionSessions, activePatients, regeln);

  return {
    settings,
    regeln,
    therapyH: totalTherapyHours(therapySessions),
    supervisionH: totalSupervisionHours(supervisionSessions),
    supervisionBySetting: supervisionHoursBySetting(supervisionSessions),
    overallRatio: calculateOverallRatio(therapySessions, supervisionSessions, regeln),
    categoryHours: sessionHoursByCategory(therapySessions),
    unsupervisedCount: getUnsupervisedSessions(therapySessions, supervisionSessions).length,
    forecast: quarterForecast({ therapySessions, supervisionSessions, groupSessions, settings, today, ebmStaffeln: regelwerk.ebmStaffeln }),
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
