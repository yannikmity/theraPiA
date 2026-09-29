import { query } from "../db";
import { Group, GroupId } from "@/types";
import { mapGroupRow, GroupRow } from "../db-mappers";
import { NotFoundError } from "../errors";
import { getCurrentUserId } from "./get-current-user";

const GROUP_COLUMNS =
  "id, name, start_date, planned_session_count, avg_kids, is_active, created_at";

export async function getGroups(): Promise<Group[]> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT ${GROUP_COLUMNS}
     FROM groups
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows.map((row: GroupRow) => mapGroupRow(row));
}

export async function getGroup(id: GroupId | string): Promise<Group | undefined> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT ${GROUP_COLUMNS}
     FROM groups
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (result.rows.length === 0) return undefined;
  return mapGroupRow(result.rows[0] as GroupRow);
}

export async function addGroup(group: Group): Promise<void> {
  const userId = await getCurrentUserId();
  await query(
    `INSERT INTO groups (id, user_id, name, start_date, planned_session_count, avg_kids, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      group.id,
      userId,
      group.name,
      group.startDate,
      group.plannedSessionCount,
      group.avgKids,
      group.isActive,
    ]
  );
}

export async function updateGroup(group: Group): Promise<void> {
  const userId = await getCurrentUserId();
  const result = await query(
    `UPDATE groups
     SET name = $1, start_date = $2, planned_session_count = $3, avg_kids = $4, is_active = $5
     WHERE id = $6 AND user_id = $7`,
    [
      group.name,
      group.startDate,
      group.plannedSessionCount,
      group.avgKids,
      group.isActive,
      group.id,
      userId,
    ]
  );

  if (result.rowCount === 0) {
    throw new NotFoundError("Gruppe");
  }
}
