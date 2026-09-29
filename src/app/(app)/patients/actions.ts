"use server";

import { v4 as uuidv4 } from "uuid";
import {
  getPatients,
  addPatient as addPatientDB,
  getTherapySessions,
  getSupervisionSessions,
} from "@/lib/db/index";
import { Patient, TherapySession, SupervisionSession, newPatientId } from "@/types";
import { createAction } from "@/lib/safe-action";
import { addPatientSchema } from "@/lib/validation";
import { ActionResult } from "@/lib/action-result";
import { z } from "zod";

interface PatientsData {
  patients: Patient[];
  therapySessions: TherapySession[];
  supervisionSessions: SupervisionSession[];
}

export async function loadPatientsData(): Promise<PatientsData> {
  const [patients, therapySessions, supervisionSessions] = await Promise.all([
    getPatients(),
    getTherapySessions(),
    getSupervisionSessions(),
  ]);

  return {
    patients,
    therapySessions,
    supervisionSessions,
  };
}

export const addPatient: (
  input: z.infer<typeof addPatientSchema>
) => Promise<ActionResult<PatientsData>> = createAction({
  schema: addPatientSchema,
  handler: async (input) => {
    const patient: Patient = {
      id: newPatientId(uuidv4()),
      chiffre: input.chiffre,
      therapyType: input.therapyType,
      startDate: input.startDate,
      endDate: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      antragsdatum: null,
      beantragteStunden: null,
      genehmigungsdatum: null,
      sprechstundenAmbulanz: 0,
    };
    await addPatientDB(patient);
    return loadPatientsData();
  },
});
