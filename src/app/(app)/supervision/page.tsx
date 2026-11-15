import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loadSupervisionData } from "./actions";
import { SupervisionClient } from "./SupervisionClient";

interface SupervisionSearchParams {
  bearbeiten?: string;
  patient?: string;
}

// ?bearbeiten=<id> öffnet diese Supervision direkt im Bearbeiten-Formular (Einstieg von der Patient:innen-Seite);
// ?patient=<id> führt „Zurück“ und das Speichern wieder dorthin. Beide nur, wenn die IDs zu eigenen Daten gehören.
export default async function SupervisionPage({ searchParams }: { searchParams: Promise<SupervisionSearchParams> }) {
  await requireSession();
  const params = await searchParams;
  const data = await loadSupervisionData();
  const editingId = data.supervisionSessions.find((s) => s.id === params.bearbeiten)?.id;
  const returnPatientId = data.patients.find((p) => p.id === params.patient)?.id;

  return (
    <ErrorBoundary>
      <SupervisionClient
        key={`${editingId ?? ""}|${returnPatientId ?? ""}`}
        initialData={data}
        initialEditingId={editingId}
        returnHref={returnPatientId ? `/patients/${returnPatientId}` : undefined}
      />
    </ErrorBoundary>
  );
}
