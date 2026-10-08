"use server";

import { v4 as uuidv4 } from "uuid";
import { withTransaction } from "@/lib/db";
import {
  getPatients,
  getSupervisors,
  addTherapySession as addTherapySessionDB,
  addSupervisionSession as addSupervisionSessionDB,
  getTherapySessions,
  getSupervisionSessions,
  insertTherapySession,
  therapySessionExists,
} from "@/lib/db/index";
import { getUnsupervisedSessions, lastSettingBySupervisor } from "@/lib/calculations";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";
import type { Ausbildungsregeln } from "@/lib/ausbildungsregeln/model";
import {
  lastCategoryByPatient,
  lastUsedPatientId,
  lastWeekSuggestions,
  type LastWeekSuggestion,
} from "@/lib/quick-capture";
import {
  Patient,
  Supervisor,
  TherapySession,
  SupervisionSession,
  SessionCategory,
  SupervisionSetting,
  newTherapySessionId,
  newSupervisionSessionId,
  PatientId,
  SupervisorId,
  TherapySessionId,
  GroupSessionId,
} from "@/types";
import { createAction } from "@/lib/safe-action";
import { addTherapySessionSchema, addTherapySessionsSchema, addSupervisionSessionSchema } from "@/lib/validation";
import { ActionResult } from "@/lib/action-result";
import { z } from "zod";

export interface SessionsData {
  patients: Patient[];
  /** Alle Patient:innen für die Fallauswahl der Supervision – auch abgeschlossene (Abschluss-Supervision). */
  supervisionPatients: Patient[];
  supervisors: Supervisor[];
  unsupervisedSessions: TherapySession[];
  lastUsedPatientId: PatientId | null;
  categoryByPatient: Record<string, SessionCategory>;
  suggestions: LastWeekSuggestion[];
  regeln: Ausbildungsregeln;
  settingBySupervisor: Record<string, SupervisionSetting>;
}

// Alles für die Erfassen-Seite aus einem Ladevorgang. `today` (YYYY-MM-DD, Europe/Berlin) kommt von der Seite,
// damit Vorschläge und Datumsvorgabe denselben Kalendertag nutzen.
export async function loadSessionsData(today: string): Promise<SessionsData> {
  const [patients, supervisors, therapySessions, supervisionSessions, regelwerk] = await Promise.all([
    getPatients(),
    getSupervisors(),
    getTherapySessions(),
    getSupervisionSessions(),
    getCurrentRegelwerk(),
  ]);

  return {
    patients: patients.filter((p) => p.isActive),
    supervisionPatients: patients,
    supervisors: supervisors.filter((s) => s.isActive),
    unsupervisedSessions: getUnsupervisedSessions(therapySessions, supervisionSessions),
    lastUsedPatientId: lastUsedPatientId(therapySessions, patients),
    categoryByPatient: lastCategoryByPatient(therapySessions),
    suggestions: lastWeekSuggestions(therapySessions, patients, today),
    regeln: regelwerk.regeln,
    settingBySupervisor: lastSettingBySupervisor(supervisionSessions),
  };
}

export const addTherapySession: (
  input: z.infer<typeof addTherapySessionSchema>
) => Promise<ActionResult<void>> = createAction({
  schema: addTherapySessionSchema,
  handler: async (input) => {
    const session: TherapySession = {
      id: newTherapySessionId(uuidv4()),
      patientId: input.patientId as PatientId,
      date: input.date,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
      category: input.category,
    };
    await addTherapySessionDB(session);
  },
});

export interface BatchSaveResult {
  saved: number;
  skipped: number;
}

// „Wie letzte Woche“: alle gewählten Vorschläge in einer Transaktion. Gibt es am Tag schon eine Sitzung der
// Patient:in (zwischen Laden und Speichern erfasst), wird die Zeile übersprungen statt abgelehnt – die
// Rückmeldung nennt beides. Die Prüfung sieht auch die in dieser Transaktion schon eingefügten Zeilen, doppelte
// Zeilen im selben Stapel werden also ebenfalls übersprungen. Fremde Patient:innen lassen insertTherapySession
// scheitern, die Transaktion rollt zurück.
export const addTherapySessions: (
  input: z.infer<typeof addTherapySessionsSchema>
) => Promise<ActionResult<BatchSaveResult>> = createAction({
  schema: addTherapySessionsSchema,
  handler: async (input, userId) =>
    withTransaction(async (tx) => {
      // Stapel derselben Person nacheinander (Doppeltipp, Wiederholung, zwei Tabs): Ohne Sperre sähen zwei
      // parallele Transaktionen unter READ COMMITTED beide „noch keine Sitzung“ und fügten doppelt ein. Die
      // Sperre gilt bis COMMIT/ROLLBACK. Bewusst kein Unique-Constraint – die Einzel-Erfassung darf zwei
      // Sitzungen einer Patient:in am selben Tag speichern.
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [userId]);
      let saved = 0;
      let skipped = 0;
      for (const s of input.sessions) {
        if (await therapySessionExists(tx, userId, s.patientId, s.date)) {
          skipped += 1;
          continue;
        }
        await insertTherapySession(tx, userId, {
          id: newTherapySessionId(uuidv4()),
          patientId: s.patientId as PatientId,
          date: s.date,
          durationMinutes: s.durationMinutes,
          notes: s.notes,
          category: s.category,
        });
        saved += 1;
      }
      return { saved, skipped };
    }),
});

export const addSupervisionSession: (
  input: z.infer<typeof addSupervisionSessionSchema>
) => Promise<ActionResult<void>> = createAction({
  schema: addSupervisionSessionSchema,
  handler: async (input) => {
    const session: SupervisionSession = {
      id: newSupervisionSessionId(uuidv4()),
      supervisorId: input.supervisorId as SupervisorId,
      date: input.date,
      durationMinutes: input.durationMinutes,
      kind: input.kind,
      setting: input.setting,
      linkedTherapySessionIds: input.linkedTherapySessionIds as TherapySessionId[],
      linkedGroupSessionIds: input.linkedGroupSessionIds as GroupSessionId[],
      caseShares: input.caseShares.map((c) => ({ patientId: c.patientId as PatientId, minutes: c.minutes })),
    };
    await addSupervisionSessionDB(session);
  },
});
