"use server";

import { v4 as uuidv4 } from "uuid";
import {
  getSupervisors,
  addSupervisor as addSupervisorDB,
  updateSupervisor as updateSupervisorDB,
} from "@/lib/db/index";
import { Supervisor, newSupervisorId } from "@/types";
import { createAction } from "@/lib/safe-action";
import { addSupervisorSchema, updateSupervisorSchema } from "@/lib/validation";
import { ActionResult } from "@/lib/action-result";
import { z } from "zod";

interface SupervisorsData {
  supervisors: Supervisor[];
}

async function loadSupervisorsData(): Promise<SupervisorsData> {
  const supervisors = await getSupervisors();
  return { supervisors };
}

export const addSupervisor: (
  input: z.infer<typeof addSupervisorSchema>
) => Promise<ActionResult<SupervisorsData>> = createAction({
  schema: addSupervisorSchema,
  handler: async (input) => {
    const supervisor: Supervisor = {
      id: newSupervisorId(uuidv4()),
      name: input.name,
      costPerHour: input.costPerHour,
      isActive: true,
    };
    await addSupervisorDB(supervisor);
    return loadSupervisorsData();
  },
});

export const updateSupervisorAction: (
  input: z.infer<typeof updateSupervisorSchema>
) => Promise<ActionResult<SupervisorsData>> = createAction({
  schema: updateSupervisorSchema,
  handler: async (input) => {
    const supervisor: Supervisor = {
      id: newSupervisorId(input.id),
      name: input.name,
      costPerHour: input.costPerHour,
      isActive: input.isActive,
    };
    await updateSupervisorDB(supervisor);
    return loadSupervisorsData();
  },
});
