import { query, withTransaction, type Db } from "../db";
import { SupervisionSession, SupervisionSessionId, TherapySessionId, GroupSessionId } from "@/types";
import { mapSupervisionSessionRow } from "../db-mappers";
import { NotFoundError } from "../errors";
import { getCurrentUserId } from "./get-current-user";

export async function getSupervisionSessions(): Promise<SupervisionSession[]> {
  const userId = await getCurrentUserId();

  // Single query with LEFT JOINs + array_agg to fix N+1
  const result = await query(
    `SELECT ss.id, ss.supervisor_id, ss.date, ss.duration_minutes, ss.kind, ss.setting,
            COALESCE(array_agg(DISTINCT stl.therapy_session_id) FILTER (WHERE stl.therapy_session_id IS NOT NULL), '{}') AS linked_therapy_session_ids,
            COALESCE(array_agg(DISTINCT sgsl.group_session_id) FILTER (WHERE sgsl.group_session_id IS NOT NULL), '{}') AS linked_group_session_ids
     FROM supervision_sessions ss
     JOIN supervisors s ON ss.supervisor_id = s.id
     LEFT JOIN supervision_therapy_links stl ON stl.supervision_id = ss.id
     LEFT JOIN supervision_group_session_links sgsl ON sgsl.supervision_id = ss.id
     WHERE s.user_id = $1
     GROUP BY ss.id, ss.supervisor_id, ss.date, ss.duration_minutes, ss.kind, ss.setting
     ORDER BY ss.date DESC`,
    [userId]
  );

  return result.rows.map((row) =>
    mapSupervisionSessionRow(
      row,
      row.linked_therapy_session_ids as TherapySessionId[],
      row.linked_group_session_ids as GroupSessionId[]
    )
  );
}

// Besitzprüfung für Supervisor:in und alle Verknüpfungen – gemeinsam für Anlegen und Ändern.
// Liest nur; fremde IDs führen zu NotFoundError, bevor irgendetwas geschrieben wird.
async function assertSupervisionOwnership(db: Db, userId: string, session: SupervisionSession): Promise<void> {
  const supervisorCheck = await db.query("SELECT id FROM supervisors WHERE id = $1 AND user_id = $2", [
    session.supervisorId,
    userId,
  ]);
  if (supervisorCheck.rows.length === 0) throw new NotFoundError("Supervisor:in");

  if (session.linkedTherapySessionIds.length > 0) {
    const owned = await db.query(
      "SELECT count(*)::int AS n FROM therapy_sessions WHERE id = ANY($1::uuid[]) AND user_id = $2",
      [session.linkedTherapySessionIds, userId]
    );
    if (owned.rows[0].n !== new Set(session.linkedTherapySessionIds).size) throw new NotFoundError("Therapiesitzung");
  }
  if (session.linkedGroupSessionIds.length > 0) {
    const owned = await db.query(
      "SELECT count(*)::int AS n FROM group_sessions WHERE id = ANY($1::uuid[]) AND user_id = $2",
      [session.linkedGroupSessionIds, userId]
    );
    if (owned.rows[0].n !== new Set(session.linkedGroupSessionIds).size) throw new NotFoundError("Gruppensitzung");
  }
}

// Doppelte IDs (Aufrufer ohne Zod-Schema, z. B. ein späterer Import) würden am Primärschlüssel scheitern (23505);
// die Besitzprüfung zählt ohnehin über ein Set. Hier zusammenfassen, damit beide Wege dasselbe Ergebnis haben.
async function insertSupervisionLinks(db: Db, session: SupervisionSession): Promise<void> {
  const therapyIds = [...new Set(session.linkedTherapySessionIds)];
  const groupIds = [...new Set(session.linkedGroupSessionIds)];
  if (therapyIds.length > 0) {
    await db.query(
      `INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id)
       SELECT $1, unnest($2::uuid[])`,
      [session.id, therapyIds]
    );
  }
  if (groupIds.length > 0) {
    await db.query(
      `INSERT INTO supervision_group_session_links (supervision_id, group_session_id)
       SELECT $1, unnest($2::uuid[])`,
      [session.id, groupIds]
    );
  }
}

export async function insertSupervisionSession(db: Db, userId: string, session: SupervisionSession): Promise<void> {
  await assertSupervisionOwnership(db, userId, session);
  await db.query(
    `INSERT INTO supervision_sessions (id, user_id, supervisor_id, date, duration_minutes, kind, setting)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [session.id, userId, session.supervisorId, session.date, session.durationMinutes, session.kind, session.setting]
  );
  await insertSupervisionLinks(db, session);
}

export async function addSupervisionSession(session: SupervisionSession): Promise<void> {
  const userId = await getCurrentUserId();
  await withTransaction((tx) => insertSupervisionSession(tx, userId, session));
}

// Ersetzt Stammdaten und alle Verknüpfungen. Nur innerhalb einer Transaktion aufrufen
// (Aufrufer: withTransaction), weil alte Verknüpfungen gelöscht und neue eingefügt werden.
// Alle Prüfungen laufen vor dem ersten Schreibzugriff, fremde IDs ändern also nichts.
export async function updateSupervisionSession(db: Db, userId: string, session: SupervisionSession): Promise<void> {
  await assertSupervisionOwnership(db, userId, session);
  const result = await db.query(
    `UPDATE supervision_sessions
     SET supervisor_id = $1, date = $2, duration_minutes = $3, kind = $4, setting = $5, updated_at = now()
     WHERE id = $6 AND user_id = $7`,
    [session.supervisorId, session.date, session.durationMinutes, session.kind, session.setting, session.id, userId]
  );
  if (result.rowCount === 0) throw new NotFoundError("Supervisionssitzung");
  await db.query("DELETE FROM supervision_therapy_links WHERE supervision_id = $1", [session.id]);
  await db.query("DELETE FROM supervision_group_session_links WHERE supervision_id = $1", [session.id]);
  await insertSupervisionLinks(db, session);
}

// Verknüpfungen fallen per ON DELETE CASCADE weg; die verknüpften Sitzungen bleiben bestehen.
export async function deleteSupervisionSession(
  db: Db,
  userId: string,
  id: SupervisionSessionId | string
): Promise<void> {
  const result = await db.query("DELETE FROM supervision_sessions WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new NotFoundError("Supervisionssitzung");
}
