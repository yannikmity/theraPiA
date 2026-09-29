import { PatientsClient } from "./PatientsClient";
import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loadPatientsData } from "./actions";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";

export default async function PatientsPage() {
  await requireSession();
  const [data, regelwerk] = await Promise.all([loadPatientsData(), getCurrentRegelwerk()]);

  return (
    <ErrorBoundary>
      <PatientsClient
        initialPatients={data.patients}
        initialTherapySessions={data.therapySessions}
        initialSupervisionSessions={data.supervisionSessions}
        regeln={regelwerk.regeln}
      />
    </ErrorBoundary>
  );
}
