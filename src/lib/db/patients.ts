import { query, type Db } from "../db";
import { Patient, PatientId } from "@/types";
import { mapPatientRow, PatientRow } from "../db-mappers";
import { NotFoundError } from "../errors";
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

export async function updatePatient(patient: Patient): Promise<void> {
  const userId = await getCurrentUserId();
  const result = await query(
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

  if (result.rowCount === 0) {
    throw new NotFoundError("Patient:in");
  }
}

// Ein Statement: Therapiesitzungen der Patient:in, deren Supervisions-Verknüpfungen und ihre Anteile an Supervisionen
// fallen per ON DELETE CASCADE mit. Der Anteil wird nicht auf andere Fälle verteilt (#40): die Gesamtdauer einer
// Supervision mit weiteren Fällen sinkt um ihn (Gesamtdauer = Summe der Anteile). Eine Supervision, die nur diese
// Patient:in besprach, hätte danach 0 Minuten und entfällt mit. Supervisionen ohne Anteil bleiben unverändert.
// Atomar ohne eigene Transaktion.
export async function deletePatient(db: Db, userId: string, id: PatientId | string): Promise<void> {
  const result = await db.query(
    `WITH anteile AS (
       SELECT sc.supervision_id, sc.minutes,
              EXISTS (SELECT 1 FROM supervision_cases o
                      WHERE o.supervision_id = sc.supervision_id AND o.patient_id <> sc.patient_id) AS weitere
       FROM supervision_cases sc JOIN patients p ON p.id = sc.patient_id
       WHERE sc.patient_id = $1 AND p.user_id = $2
     ), gekuerzt AS (
       UPDATE supervision_sessions ss SET duration_minutes = ss.duration_minutes - a.minutes, updated_at = now()
       FROM anteile a WHERE ss.id = a.supervision_id AND ss.user_id = $2 AND a.weitere
     ), entfallen AS (
       DELETE FROM supervision_sessions ss USING anteile a
       WHERE ss.id = a.supervision_id AND ss.user_id = $2 AND NOT a.weitere
     )
     DELETE FROM patients WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (result.rowCount === 0) throw new NotFoundError("Patient:in");
}
