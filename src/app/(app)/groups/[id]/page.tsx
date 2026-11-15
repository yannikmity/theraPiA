import { GroupDetailClient } from "./GroupDetailClient";
import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/layout/PageHeader";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { loadGroupDetailData } from "./actions";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  // Keine UUID (vertippte oder alte Adresse): gleich „nicht gefunden“ statt Datenbankfehler und Fehlerseite.
  if (!UUID.test(id)) {
    return <PageHeader title="Gruppe nicht gefunden" backHref="/groups" />;
  }
  const [data, regelwerk] = await Promise.all([loadGroupDetailData(id), getCurrentRegelwerk()]);

  if (!data.group) {
    return <PageHeader title="Gruppe nicht gefunden" backHref="/groups" />;
  }

  return (
    <ErrorBoundary>
      <GroupDetailClient
        initialGroup={data.group}
        initialGroupSessions={data.groupSessions}
        initialSupervisionSessions={data.supervisionSessions}
        initialSupervisedGroupSessionIds={data.supervisedGroupSessionIds}
        initialSupervisors={data.supervisors}
        regelwerk={regelwerk}
      />
    </ErrorBoundary>
  );
}
