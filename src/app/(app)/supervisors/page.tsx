import { requireSession } from "@/lib/require-session";
import { getSupervisors } from "@/lib/db/index";
import { SupervisorsClient } from "./SupervisorsClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default async function SupervisorsPage() {
  await requireSession();

  const supervisors = await getSupervisors();

  return (
    <ErrorBoundary>
      <SupervisorsClient initialSupervisors={supervisors} />
    </ErrorBoundary>
  );
}
