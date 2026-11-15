import { PatientDetailClient } from "./PatientDetailClient";
import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/layout/PageHeader";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { loadPatientDetailData } from "./actions";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  // Keine UUID (vertippte oder alte Adresse): gleich „nicht gefunden“ statt Datenbankfehler und Fehlerseite.
  if (!UUID.test(id)) {
    return <PageHeader title="Patient:in nicht gefunden" backHref="/patients" />;
  }
  const [data, regelwerk] = await Promise.all([loadPatientDetailData(id), getCurrentRegelwerk()]);

  if (!data.patient) {
    return <PageHeader title="Patient:in nicht gefunden" backHref="/patients" />;
  }

  return (
    <ErrorBoundary>
      <PatientDetailClient
        initialPatient={data.patient}
        initialTherapySessions={data.therapySessions}
        initialSupervisionSessions={data.supervisionSessions}
        initialSupervisors={data.supervisors}
        regeln={regelwerk.regeln}
      />
    </ErrorBoundary>
  );
}
