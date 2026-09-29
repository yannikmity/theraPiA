import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loadSupervisionData } from "./actions";
import { SupervisionClient } from "./SupervisionClient";

export default async function SupervisionPage() {
  await requireSession();
  const data = await loadSupervisionData();

  return (
    <ErrorBoundary>
      <SupervisionClient initialData={data} />
    </ErrorBoundary>
  );
}
