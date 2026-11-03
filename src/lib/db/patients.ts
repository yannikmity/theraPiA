import { query, type Db } from "../db";
import { Patient, PatientId } from "@/types";
import { mapPatientRow, PatientRow } from "../db-mappers";
import { NotFoundError, ValidationError } from "../errors";
import { getCurrentUserId } from "./get-current-user";

const PATIENT_COLUMNS =
  "id, chiffre, therapy_type, start_date, end_date, is_active, created_at, antragsdatum, beantragte_stunden, genehmigungsdatum, sprechstunden_ambulanz";

export async function getPatients(): Promise<Patient[]> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT ${PATIENT_COLUMNS}
     FROM patients
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows.map((row: PatientRow) => mapPatientRow(row));
}

export async function getPatient(id: PatientId | string): Promise<Patient | undefined> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT ${PATIENT_COLUMNS}
     FROM patients
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (result.rows.length === 0) return undefined;
  return mapPatientRow(result.rows[0] as PatientRow);
}

export async function addPatient(patient: Patient): Promise<void> {
  const userId = await getCurrentUserId();
  await query(
    `INSERT INTO patients (id, user_id, chiffre, therapy_type, start_date, end_date, is_active, antragsdatum, beantragte_stunden,
                           genehmigungsdatum, sprechstunden_ambulanz)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      patient.id,
      userId,
      patient.chiffre,
      patient.therapyType,
      patient.startDate,
      patient.endDate,
      patient.isActive,
      patient.antragsdatum,
      patient.beantragteStunden,
      patient.genehmigungsdatum,
      patient.sprechstundenAmbulanz,
    ]
  );
}

export const MELDUNG_CHIFFRE_VERGEBEN = "Diese Chiffre ist schon vergeben";

// Die Chiffre ist je Account eindeutig (UNIQUE(user_id, chiffre)). Eine Kollision beim Umbenennen (23505) wird zur
// Meldung am Feld statt zum Serverfehler (#74); andere Fehler gehen weiter.
export async function updatePatient(db: Db, userId: string, patient: Patient): Promise<void> {
  let result;
  try {
    result = await db.query(
      `UPDATE patients
       SET chiffre = $1, therapy_type = $2, start_date = $3, end_date = $4, is_active = $5,
           antragsdatum = $6, beantragte_stunden = $7, genehmigungsdatum = $10, sprechstunden_ambulanz = $11
       WHERE id = $8 AND user_id = $9`,
      [
        patient.chiffre,
        patient.therapyType,
        patient.startDate,
        patient.endDate,
        patient.isActive,
        patient.antragsdatum,
        patient.beantragteStunden,
        patient.id,
        userId,
        patient.genehmigungsdatum,
        patient.sprechstundenAmbulanz,
      ]
    );
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };
    if (code === "23505" && constraint === "patients_user_id_chiffre_key") {
      throw new ValidationError(MELDUNG_CHIFFRE_VERGEBEN, { chiffre: [MELDUNG_CHIFFRE_VERGEBEN] });
    }
    throw error;
  }

  if (result.rowCount === 0) {
    throw new NotFoundError("Patient:in");
  }
}

// Ein Statement: Therapiesitzungen der Patient:in, deren Supervisions-Verknüpfungen und ihre Anteile an Supervisionen
// fallen per ON DELETE CASCADE mit. Die Supervisionen bleiben mit unveränderter Gesamtdauer – sie haben stattgefunden,
// Kosten und Nachweis ändern sich nicht rückwirkend. Der Anteil wird nicht auf andere Fälle verteilt (#40); die
// Differenz zwischen Gesamtdauer und Summe der Anteile ist Zeit ohne vorhandenen Fall. Atomar ohne eigene Transaktion.
export async function deletePatient(db: Db, userId: string, id: PatientId | string): Promise<void> {
  const result = await db.query("DELETE FROM patients WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new NotFoundError("Patient:in");
}
