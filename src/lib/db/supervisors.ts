import { query, type Db } from "../db";
import { Supervisor } from "@/types";
import { mapSupervisorRow, SupervisorRow } from "../db-mappers";
import { NotFoundError, ValidationError } from "../errors";
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
  const result = await query(
    `UPDATE supervisors
     SET name = $1, cost_per_hour = $2, is_active = $3
     WHERE id = $4 AND user_id = $5`,
    [supervisor.name, supervisor.costPerHour, supervisor.isActive, supervisor.id, userId]
  );
  if (result.rowCount === 0) throw new NotFoundError("Supervisor:in");
}

// Doppelte Einträge zusammenführen (Pilot-Feedback: dieselbe Person je Setting zweimal angelegt): alle Supervisionen
// von `fromId` gehen an `toId`, danach wird `fromId` gelöscht. Beide müssen dem Account gehören. In einer Transaktion,
// und vor dem Löschen umgehängt – sonst nähme ON DELETE CASCADE die Supervisionen mit.
// Nur innerhalb einer Transaktion aufrufen (Aufrufer: withTransaction).
export async function mergeSupervisors(tx: Db, userId: string, fromId: string, toId: string): Promise<number> {
  // FOR UPDATE sperrt beide Einträge: Eine parallel gespeicherte Supervision bei `fromId` wartet, bis die Transaktion
  // fertig ist, und scheitert dann am fehlenden Eintrag, statt per CASCADE mitgelöscht zu werden.
  const own = await tx.query("SELECT id FROM supervisors WHERE id = ANY($1::uuid[]) AND user_id = $2 FOR UPDATE", [[fromId, toId], userId]);
  if (own.rows.length !== 2) throw new NotFoundError("Supervisor:in");
  const moved = await tx.query(
    "UPDATE supervision_sessions SET supervisor_id = $1, updated_at = now() WHERE supervisor_id = $2 AND user_id = $3",
    [toId, fromId, userId]
  );
  // Sicherheitsnetz: Hängt noch irgendeine Supervision am Eintrag, nicht löschen – sonst nähme CASCADE sie mit.
  const rest = await tx.query("SELECT 1 FROM supervision_sessions WHERE supervisor_id = $1 LIMIT 1", [fromId]);
  if (rest.rows.length > 0) throw new ValidationError("Zusammenführen abgebrochen: Es hängen noch Supervisionen am Eintrag.");
  await tx.query("DELETE FROM supervisors WHERE id = $1 AND user_id = $2", [fromId, userId]);
  return moved.rowCount ?? 0;
}
