import { PatientDetailClient } from "./PatientDetailClient";
import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadPatientDetailData } from "./actions";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
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
