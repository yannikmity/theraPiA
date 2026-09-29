import { query } from "../db";
import { Supervisor } from "@/types";
import { mapSupervisorRow, SupervisorRow } from "../db-mappers";
import { getCurrentUserId } from "./get-current-user";

export async function getSupervisors(): Promise<Supervisor[]> {
  const userId = await getCurrentUserId();
  const result = await query(
    `SELECT id, name, cost_per_hour, is_active
     FROM supervisors
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows.map((row: SupervisorRow) => mapSupervisorRow(row));
}

export async function addSupervisor(supervisor: Supervisor): Promise<void> {
  const userId = await getCurrentUserId();
  await query(
    `INSERT INTO supervisors (id, user_id, name, cost_per_hour, is_active)
     VALUES ($1, $2, $3, $4, $5)`,
    [supervisor.id, userId, supervisor.name, supervisor.costPerHour, supervisor.isActive]
  );
}

export async function updateSupervisor(supervisor: Supervisor): Promise<void> {
  const userId = await getCurrentUserId();
  await query(
    `UPDATE supervisors
     SET name = $1, cost_per_hour = $2, is_active = $3
     WHERE id = $4 AND user_id = $5`,
    [supervisor.name, supervisor.costPerHour, supervisor.isActive, supervisor.id, userId]
  );
}
