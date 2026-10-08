"use server";

import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import {
  getGroup,
  getGroupSessionsForGroup,
  addGroupSession as addGroupSessionDB,
  updateGroupSession as updateGroupSessionDB,
  deleteGroupSession as deleteGroupSessionDB,
  getSupervisors,
  getSupervisionSessions,
  addSupervisionSession as addSupervisionSessionDB,
} from "@/lib/db/index";
import {
  Group,
  GroupId,
  GroupSession,
  Supervisor,
  SupervisionSession,
  newGroupSessionId,
  newSupervisionSessionId,
  SupervisorId,
  GroupSessionId,
} from "@/types";
import { createAction } from "@/lib/safe-action";
import {
  addGroupSessionSchema,
  updateGroupSessionSchema,
  deleteGroupSessionSchema,
  addGroupSupervisionSessionSchema,
} from "@/lib/validation";
import { ActionResult } from "@/lib/action-result";
import { z } from "zod";

interface GroupDetailData {
  group: Group | undefined;
  groupSessions: GroupSession[];
  supervisionSessions: SupervisionSession[];
  supervisors: Supervisor[];
}

export async function loadGroupDetailData(groupId: string): Promise<GroupDetailData> {
  const [group, groupSessions, supervisionSessions, supervisors] = await Promise.all([
    getGroup(groupId),
    getGroupSessionsForGroup(groupId),
    getSupervisionSessions(),
    getSupervisors(),
  ]);

  // Nur Supervisionen dieser Gruppe (#47) – über den gespeicherten Gruppenbezug, nicht über die Links: Sie bleiben in
  // der Gruppe, auch ohne verknüpfte oder nach gelöschten Doppelstunden.
  return {
    group,
    groupSessions,
    supervisionSessions: supervisionSessions.filter((s) => s.kind === "group" && s.groupId === groupId),
    supervisors,
  };
}

export const addGroupSession: (
  input: z.infer<typeof addGroupSessionSchema>
) => Promise<ActionResult<GroupDetailData>> = createAction({
  schema: addGroupSessionSchema,
  handler: async (input) => {
    const session: GroupSession = {
      id: newGroupSessionId(uuidv4()),
      groupId: input.groupId as Group["id"],
      date: input.date,
      status: input.status,
      childCount: input.childCount,
      countsTowardAmbulanzzeit: input.countsTowardAmbulanzzeit,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
    };
    await addGroupSessionDB(session);
    return loadGroupDetailData(input.groupId);
  },
});

export const updateGroupSession: (
  input: z.infer<typeof updateGroupSessionSchema>
) => Promise<ActionResult<GroupDetailData>> = createAction({
  schema: updateGroupSessionSchema,
  handler: async (input) => {
    const session: GroupSession = {
      id: input.id as GroupSession["id"],
      groupId: input.groupId as Group["id"],
      date: input.date,
      status: input.status,
      childCount: input.childCount,
      countsTowardAmbulanzzeit: input.countsTowardAmbulanzzeit,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
    };
    await updateGroupSessionDB(session);
    return loadGroupDetailData(input.groupId);
  },
});

export const deleteGroupSession: (
  input: z.infer<typeof deleteGroupSessionSchema>
) => Promise<ActionResult<GroupDetailData>> = createAction({
  schema: deleteGroupSessionSchema,
  handler: async (input, userId) => {
    await deleteGroupSessionDB(db, userId, input.id);
    return loadGroupDetailData(input.groupId);
  },
});

export const addGroupSupervisionSession: (
  input: z.infer<typeof addGroupSupervisionSessionSchema>
) => Promise<ActionResult<GroupDetailData>> = createAction({
  schema: addGroupSupervisionSessionSchema,
  handler: async (input) => {
    const session: SupervisionSession = {
      id: newSupervisionSessionId(uuidv4()),
      supervisorId: input.supervisorId as SupervisorId,
      date: input.date,
      durationMinutes: input.durationMinutes,
      kind: "group",
      setting: input.setting,
      linkedTherapySessionIds: [],
      linkedGroupSessionIds: input.linkedGroupSessionIds as GroupSessionId[],
      caseShares: [],
      groupId: input.groupId as GroupId,
    };
    await addSupervisionSessionDB(session);
    return loadGroupDetailData(input.groupId);
  },
});
