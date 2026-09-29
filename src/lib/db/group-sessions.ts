import { query, type Db } from "../db";
import { GroupSession, GroupId, GroupSessionId } from "@/types";
import { mapGroupSessionRow, GroupSessionRow } from "../db-mappers";
import { NotFoundError } from "../errors";
import { getCurrentUserId } from "./get-current-user";

const GROUP_SESSION_COLUMNS =
  "gs.id, gs.group_id, gs.date, gs.status, gs.child_count, gs.counts_toward_ambulanzzeit, gs.duration_minutes, gs.notes";

export async function getGroupSessions(): Promise<GroupSession[]> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT ${GROUP_SESSION_COLUMNS}
     FROM group_sessions gs
     JOIN groups g ON gs.group_id = g.id
     WHERE g.user_id = $1
     ORDER BY gs.date DESC`,
    [userId]
  );

  return result.rows.map((row: GroupSessionRow) => mapGroupSessionRow(row));
}

export async function getGroupSessionsForGroup(
  groupId: GroupId | string
): Promise<GroupSession[]> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT ${GROUP_SESSION_COLUMNS}
     FROM group_sessions gs
     JOIN groups g ON gs.group_id = g.id
     WHERE gs.group_id = $1 AND g.user_id = $2
     ORDER BY gs.date DESC`,
    [groupId, userId]
  );

  return result.rows.map((row: GroupSessionRow) => mapGroupSessionRow(row));
}

export async function addGroupSession(session: GroupSession): Promise<void> {
  const userId = await getCurrentUserId();

  // Verify group belongs to user
  const groupCheck = await query(
    "SELECT id FROM groups WHERE id = $1 AND user_id = $2",
    [session.groupId, userId]
  );

  if (groupCheck.rows.length === 0) {
    throw new NotFoundError("Gruppe");
  }

  await query(
    `INSERT INTO group_sessions (id, user_id, group_id, date, status, child_count, counts_toward_ambulanzzeit, duration_minutes, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      session.id,
      userId,
      session.groupId,
      session.date,
      session.status,
      session.childCount,
      session.countsTowardAmbulanzzeit,
      session.durationMinutes,
      session.notes,
    ]
  );
}

export async function updateGroupSession(session: GroupSession): Promise<void> {
  const userId = await getCurrentUserId();
  const result = await query(
    `UPDATE group_sessions
     SET date = $1, status = $2, child_count = $3, counts_toward_ambulanzzeit = $4,
         duration_minutes = $5, notes = $6
     WHERE id = $7 AND user_id = $8`,
    [
      session.date,
      session.status,
      session.childCount,
      session.countsTowardAmbulanzzeit,
      session.durationMinutes,
      session.notes,
      session.id,
      userId,
    ]
  );

  if (result.rowCount === 0) {
    throw new NotFoundError("Doppelstunde");
  }
}

// Verknüpfungen zu Gruppen-Supervisionen fallen per ON DELETE CASCADE weg, die Supervision bleibt.
export async function deleteGroupSession(db: Db, userId: string, id: GroupSessionId | string): Promise<void> {
  const result = await db.query("DELETE FROM group_sessions WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new NotFoundError("Doppelstunde");
}
