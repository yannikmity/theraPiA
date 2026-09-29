"use server";

import { db, withTransaction } from "@/lib/db";
import {
  getSupervisionSessions,
  getSupervisors,
  getPatients,
  getTherapySessions,
  getGroups,
  getGroupSessions,
  updateSupervisionSession as updateSupervisionSessionDB,
  deleteSupervisionSession as deleteSupervisionSessionDB,
} from "@/lib/db/index";
import {
  Patient,
  Supervisor,
  TherapySession,
  SupervisionSession,
  Group,
  GroupSession,
  SupervisionSessionId,
  SupervisorId,
  TherapySessionId,
  GroupSessionId,
} from "@/types";
import { createAction } from "@/lib/safe-action";
import { updateSupervisionSessionSchema, deleteByIdSchema } from "@/lib/validation";
import { ActionResult } from "@/lib/action-result";
import { z } from "zod";

export interface SupervisionData {
  supervisionSessions: SupervisionSession[];
  supervisors: Supervisor[];
  patients: Patient[];
  therapySessions: TherapySession[];
  groups: Group[];
  groupSessions: GroupSession[];
}

export async function loadSupervisionData(): Promise<SupervisionData> {
  const [supervisionSessions, supervisors, patients, therapySessions, groups, groupSessions] = await Promise.all([
    getSupervisionSessions(),
    getSupervisors(),
    getPatients(),
    getTherapySessions(),
    getGroups(),
    getGroupSessions(),
  ]);
  return { supervisionSessions, supervisors, patients, therapySessions, groups, groupSessions };
}

export const updateSupervisionSessionAction: (
  input: z.infer<typeof updateSupervisionSessionSchema>
) => Promise<ActionResult<SupervisionData>> = createAction({
  schema: updateSupervisionSessionSchema,
  handler: async (input, userId) => {
    const session: SupervisionSession = {
      id: input.id as SupervisionSessionId,
      supervisorId: input.supervisorId as SupervisorId,
      date: input.date,
      durationMinutes: input.durationMinutes,
      kind: input.kind,
      linkedTherapySessionIds: input.linkedTherapySessionIds as TherapySessionId[],
      linkedGroupSessionIds: input.linkedGroupSessionIds as GroupSessionId[],
    };
    // Stammdaten und Verknüpfungen in einer Transaktion ersetzen.
    await withTransaction((tx) => updateSupervisionSessionDB(tx, userId, session));
    return loadSupervisionData();
  },
});

export const deleteSupervisionSessionAction: (
  input: z.infer<typeof deleteByIdSchema>
) => Promise<ActionResult<SupervisionData>> = createAction({
  schema: deleteByIdSchema,
  handler: async (input, userId) => {
    await deleteSupervisionSessionDB(db, userId, input.id);
    return loadSupervisionData();
  },
});
