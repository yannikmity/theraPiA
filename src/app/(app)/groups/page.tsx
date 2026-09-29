import { GroupsClient } from "./GroupsClient";
import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loadGroupsData } from "./actions";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";

export default async function GroupsPage() {
  await requireSession();
  const [data, regelwerk] = await Promise.all([loadGroupsData(), getCurrentRegelwerk()]);

  return (
    <ErrorBoundary>
      <GroupsClient initialGroups={data.groups} initialGroupSessions={data.groupSessions} ebmStaffeln={regelwerk.ebmStaffeln} />
    </ErrorBoundary>
  );
}
