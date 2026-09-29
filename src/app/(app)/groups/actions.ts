"use server";

import { v4 as uuidv4 } from "uuid";
import { getGroups, addGroup as addGroupDB, getGroupSessions } from "@/lib/db/index";
import { Group, GroupSession, newGroupId } from "@/types";
import { createAction } from "@/lib/safe-action";
import { addGroupSchema } from "@/lib/validation";
import { ActionResult } from "@/lib/action-result";
import { z } from "zod";

interface GroupsData {
  groups: Group[];
  groupSessions: GroupSession[];
}

export async function loadGroupsData(): Promise<GroupsData> {
  const [groups, groupSessions] = await Promise.all([getGroups(), getGroupSessions()]);

  return { groups, groupSessions };
}

export const addGroup: (
  input: z.infer<typeof addGroupSchema>
) => Promise<ActionResult<GroupsData>> = createAction({
  schema: addGroupSchema,
  handler: async (input) => {
    const group: Group = {
      id: newGroupId(uuidv4()),
      name: input.name,
      startDate: input.startDate,
      plannedSessionCount: input.plannedSessionCount,
      avgKids: input.avgKids,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await addGroupDB(group);
    return loadGroupsData();
  },
});
