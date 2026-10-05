import { NewSessionClient } from "./NewSessionClient";
import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { todayIso } from "@/lib/dates";
import { resolveInitialPatientId, resolveInitialType } from "@/lib/quick-capture";
import { loadSessionsData } from "./actions";

interface NewSessionSearchParams {
  patient?: string;
  type?: string;
}

// ?patient=<id> (Schnelleinstieg von Dashboard und Patient:innen-Detail) wählt die Patient:in vor, ?type=supervision
// startet in der Supervisions-Erfassung („Offene Supervision“ auf dem Dashboard). `key` aus beiden Parametern: ein
// neuer Deep-Link setzt den Formularzustand zurück. `today` ist der Kalendertag in Europe/Berlin – Datumsvorgabe
// und Vorschläge rechnen damit auf Server und Client gleich.
export default async function NewSessionPage({ searchParams }: { searchParams: Promise<NewSessionSearchParams> }) {
  await requireSession();
  const params = await searchParams;
  const today = todayIso();
  const data = await loadSessionsData(today);

  return (
    <ErrorBoundary>
      <NewSessionClient
        key={`${params.type ?? ""}|${params.patient ?? ""}`}
        initialPatients={data.patients}
        supervisionPatients={data.supervisionPatients}
        initialSupervisors={data.supervisors}
        initialUnsupervisedSessions={data.unsupervisedSessions}
        today={today}
        initialType={resolveInitialType(params.type)}
        initialPatientId={resolveInitialPatientId(params.patient, data.patients, data.lastUsedPatientId)}
        categoryByPatient={data.categoryByPatient}
        suggestions={data.suggestions}
        regeln={data.regeln}
        settingBySupervisor={data.settingBySupervisor}
      />
    </ErrorBoundary>
  );
}
