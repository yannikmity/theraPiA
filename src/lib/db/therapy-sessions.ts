import { query, type Db } from "../db";
import { TherapySession, TherapySessionId, PatientId } from "@/types";
import { mapTherapySessionRow, TherapySessionRow } from "../db-mappers";
import { NotFoundError } from "../errors";
import { getCurrentUserId } from "./get-current-user";

// Neueste zuerst; am selben Tag entscheidet die Erfassungszeit (bei Gleichstand, etwa im selben Stapel, die ID
// für eine stabile Reihenfolge) – Grundlage für die Vorbelegung „zuletzt genutzte Patient:in“.
export async function getTherapySessions(): Promise<TherapySession[]> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT ts.id, ts.patient_id, ts.date, ts.duration_minutes, ts.notes, ts.category
     FROM therapy_sessions ts
     JOIN patients p ON ts.patient_id = p.id
     WHERE p.user_id = $1
     ORDER BY ts.date DESC, ts.created_at DESC, ts.id DESC`,
    [userId]
  );

  return result.rows.map((row: TherapySessionRow) => mapTherapySessionRow(row));
}

export async function getTherapySessionsForPatient(
  patientId: PatientId | string
): Promise<TherapySession[]> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT ts.id, ts.patient_id, ts.date, ts.duration_minutes, ts.notes, ts.category
     FROM therapy_sessions ts
     JOIN patients p ON ts.patient_id = p.id
     WHERE ts.patient_id = $1 AND p.user_id = $2
     ORDER BY ts.date DESC`,
    [patientId, userId]
  );

  return result.rows.map((row: TherapySessionRow) => mapTherapySessionRow(row));
}

export async function addTherapySession(session: TherapySession): Promise<void> {
  const userId = await getCurrentUserId();

  // Verify patient belongs to user
  const patientCheck = await query(
    "SELECT id FROM patients WHERE id = $1 AND user_id = $2",
    [session.patientId, userId]
  );

  if (patientCheck.rows.length === 0) {
    throw new NotFoundError("Patient:in");
  }

  await query(
    `INSERT INTO therapy_sessions (id, user_id, patient_id, date, duration_minutes, notes, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      session.id,
      userId,
      session.patientId,
      session.date,
      session.durationMinutes,
      session.notes,
      session.category,
    ]
  );
}

// Neuer Stil (wie insertSupervisionSession): Verbindung und Nutzer-ID kommen vom Aufrufer,
// dadurch ohne Session-Mock gegen die Testdatenbank prüfbar. patient_id wird nicht geändert – der Typ
// nimmt das Feld deshalb gar nicht erst an (Umhängen an andere Patient:innen ist kein Anwendungsfall).
export async function updateTherapySession(
  db: Db,
  userId: string,
  session: Omit<TherapySession, "patientId">
): Promise<void> {
  const result = await db.query(
    `UPDATE therapy_sessions
     SET date = $1, duration_minutes = $2, notes = $3, category = $4, updated_at = now()
     WHERE id = $5 AND user_id = $6`,
    [session.date, session.durationMinutes, session.notes, session.category, session.id, userId]
  );
  if (result.rowCount === 0) throw new NotFoundError("Therapiesitzung");
}

// Verknüpfungen zu Supervisionen fallen per ON DELETE CASCADE weg, die Supervision bleibt.
export async function deleteTherapySession(db: Db, userId: string, id: TherapySessionId | string): Promise<void> {
  const result = await db.query("DELETE FROM therapy_sessions WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new NotFoundError("Therapiesitzung");
}

// Gibt es am Tag schon eine Sitzung dieser Patient:in? Grundlage für „Wie letzte Woche“ (keine Doppelten) –
// nur im eigenen Account, fremde Zeilen sind unsichtbar.
export async function therapySessionExists(
  db: Db,
  userId: string,
  patientId: PatientId | string,
  date: string
): Promise<boolean> {
  const result = await db.query(
    "SELECT 1 FROM therapy_sessions WHERE user_id = $1 AND patient_id = $2 AND date = $3 LIMIT 1",
    [userId, patientId, date]
  );
  return result.rows.length > 0;
}

// Neuer Stil (wie updateTherapySession): Verbindung und Nutzer-ID vom Aufrufer, damit mehrere Sitzungen in
// einer Transaktion landen. Die Patient:in muss der Person gehören – fremde IDs enden in NotFoundError, bevor
// geschrieben wird. addTherapySession (alter Stil, Pool) bleibt für die Einzel-Erfassung unverändert.
export async function insertTherapySession(db: Db, userId: string, session: TherapySession): Promise<void> {
  const owned = await db.query("SELECT 1 FROM patients WHERE id = $1 AND user_id = $2", [session.patientId, userId]);
  if (owned.rows.length === 0) throw new NotFoundError("Patient:in");
  await db.query(
    `INSERT INTO therapy_sessions (id, user_id, patient_id, date, duration_minutes, notes, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [session.id, userId, session.patientId, session.date, session.durationMinutes, session.notes, session.category]
  );
}
