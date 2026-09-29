import { query } from "../db";
import { FinancialSettings, FinancialSettingsUpdate, SupervisorId } from "@/types";
import { getCurrentUserId } from "./get-current-user";

const SELECT_SETTINGS = "SELECT income_per_hour, planned_sessions_per_week FROM financial_settings WHERE user_id = $1";

// Kosten je Supervisor:in stehen in der Supervisor:innen-Tabelle – unabhängig davon, ob die Einstellungszeile existiert.
async function supervisionCostsOf(userId: string): Promise<Record<SupervisorId, number>> {
  const result = await query("SELECT id, cost_per_hour FROM supervisors WHERE user_id = $1", [userId]);
  const costs = {} as Record<SupervisorId, number>;
  for (const sv of result.rows) {
    if (sv.cost_per_hour) costs[sv.id as SupervisorId] = sv.cost_per_hour;
  }
  return costs;
}

export async function getFinancialSettings(): Promise<FinancialSettings> {
  const userId = await getCurrentUserId();
  let row = (await query(SELECT_SETTINGS, [userId])).rows[0];
  if (!row) {
    // Standardzeile anlegen. Zwei gleichzeitige erste Aufrufe (etwa Dashboard und Finanzen) dürfen nicht an
    // UNIQUE(user_id) scheitern: wer verliert, tut nichts und liest die Zeile der anderen.
    await query(
      "INSERT INTO financial_settings (user_id, income_per_hour) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING",
      [userId]
    );
    row = (await query(SELECT_SETTINGS, [userId])).rows[0];
  }
  return {
    incomePerHour: row.income_per_hour,
    supervisionCosts: await supervisionCostsOf(userId),
    plannedSessionsPerWeek: row.planned_sessions_per_week,
  };
}

export async function updateFinancialSettings(settings: FinancialSettingsUpdate): Promise<void> {
  const userId = await getCurrentUserId();
  const planned = settings.plannedSessionsPerWeek;
  // Ein Upsert statt SELECT-dann-INSERT/UPDATE. Die Planung ändert sich nur, wenn das Feld mitgeschickt wurde ($4);
  // ein Schreibpfad, der sie nicht kennt, kann sie nicht auf NULL setzen. Beim Anlegen zählt der Wert (oder NULL).
  await query(
    `INSERT INTO financial_settings (user_id, income_per_hour, planned_sessions_per_week)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       income_per_hour = EXCLUDED.income_per_hour,
       planned_sessions_per_week = CASE WHEN $4::boolean THEN EXCLUDED.planned_sessions_per_week
                                        ELSE financial_settings.planned_sessions_per_week END`,
    [userId, settings.incomePerHour, planned ?? null, planned !== undefined]
  );

  for (const [supervisorId, cost] of Object.entries(settings.supervisionCosts)) {
    await query("UPDATE supervisors SET cost_per_hour = $1 WHERE id = $2 AND user_id = $3", [cost, supervisorId, userId]);
  }
}
