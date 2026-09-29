import { GroupDetailClient } from "./GroupDetailClient";
import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadGroupDetailData } from "./actions";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
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
        initialSupervisors={data.supervisors}
        regelwerk={regelwerk}
      />
    </ErrorBoundary>
  );
}
