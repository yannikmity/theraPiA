"use server";

import { db } from "@/lib/db";
import {
  getPatient,
  updatePatient as updatePatientDB,
  getTherapySessions,
  getSupervisionSessions,
  getSupervisors,
  updateTherapySession as updateTherapySessionDB,
  deleteTherapySession as deleteTherapySessionDB,
  deletePatient as deletePatientDB,
} from "@/lib/db/index";
import { Patient, TherapySession, SupervisionSession, Supervisor } from "@/types";
import { createAction } from "@/lib/safe-action";
import {
  updatePatientSchema,
  updateTherapySessionSchema,
  deleteTherapySessionSchema,
  deleteByIdSchema,
} from "@/lib/validation";
import { ActionResult } from "@/lib/action-result";
import { z } from "zod";

export interface PatientDetailData {
  patient: Patient | undefined;
  therapySessions: TherapySession[];
  supervisionSessions: SupervisionSession[];
  supervisors: Supervisor[];
}

export async function loadPatientDetailData(patientId: string): Promise<PatientDetailData> {
  const [patient, therapySessions, supervisionSessions, supervisors] = await Promise.all([
    getPatient(patientId),
    getTherapySessions(),
    getSupervisionSessions(),
    getSupervisors(),
  ]);

  return {
    patient,
    therapySessions,
    supervisionSessions,
    supervisors,
  };
}

export const updatePatient: (
  input: z.infer<typeof updatePatientSchema>
) => Promise<ActionResult<PatientDetailData>> = createAction({
  schema: updatePatientSchema,
  handler: async (input) => {
    const existing = await getPatient(input.id);
    const patient: Patient = {
      id: input.id as Patient["id"],
      chiffre: input.chiffre,
      therapyType: input.therapyType,
      startDate: input.startDate,
      endDate: input.endDate,
      isActive: input.isActive,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      antragsdatum: input.antragsdatum,
      beantragteStunden: input.beantragteStunden,
      genehmigungsdatum: input.genehmigungsdatum,
      sprechstundenAmbulanz: input.sprechstundenAmbulanz,
    };
    await updatePatientDB(patient);
    return loadPatientDetailData(patient.id);
  },
});

export const updateTherapySession: (
  input: z.infer<typeof updateTherapySessionSchema>
) => Promise<ActionResult<PatientDetailData>> = createAction({
  schema: updateTherapySessionSchema,
  handler: async (input, userId) => {
    await updateTherapySessionDB(db, userId, {
      id: input.id as TherapySession["id"],
      date: input.date,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
      category: input.category,
    });
    return loadPatientDetailData(input.patientId);
  },
});

export const deleteTherapySession: (
  input: z.infer<typeof deleteTherapySessionSchema>
) => Promise<ActionResult<PatientDetailData>> = createAction({
  schema: deleteTherapySessionSchema,
  handler: async (input, userId) => {
    await deleteTherapySessionDB(db, userId, input.id);
    return loadPatientDetailData(input.patientId);
  },
});

export const deletePatient: (
  input: z.infer<typeof deleteByIdSchema>
) => Promise<ActionResult<void>> = createAction({
  schema: deleteByIdSchema,
  handler: async (input, userId) => {
    await deletePatientDB(db, userId, input.id);
  },
});
