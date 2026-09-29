import type { Client } from "pg";

export interface SeededAccount {
  userId: string;
  supervisorId: string;
  patientId: string;
  therapySessionId: string;
  groupId: string;
  groupSessionId: string;
  supervisionId: string;
}

export interface OwnershipFixture {
  a: SeededAccount;
  b: SeededAccount;
}

async function seedAccount(client: Client, prefix: string): Promise<SeededAccount> {
  const one = async (sql: string, params: unknown[]) => (await client.query(sql, params)).rows[0];
  const user = await one("INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id", [
    `${prefix.toLowerCase()}@example.com`,
    `PiA ${prefix}`,
  ]);
  const supervisor = await one("INSERT INTO supervisors (user_id, name) VALUES ($1, $2) RETURNING id", [
    user.id,
    `Supervision ${prefix}`,
  ]);
  const patient = await one(
    "INSERT INTO patients (user_id, chiffre, therapy_type, start_date) VALUES ($1, $2, 'kurzzeittherapie', '2026-01-01') RETURNING id",
    [user.id, `${prefix}-1`]
  );
  const therapySession = await one(
    `INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes, notes, category)
     VALUES ($1, $2, '2026-01-02', 50, 'Erstgespräch', 'probatorik') RETURNING id`,
    [user.id, patient.id]
  );
  const group = await one(
    "INSERT INTO groups (user_id, name, start_date, planned_session_count) VALUES ($1, $2, '2026-01-01', 10) RETURNING id",
    [user.id, `Gruppe ${prefix}`]
  );
  const groupSession = await one(
    "INSERT INTO group_sessions (user_id, group_id, date, status, child_count) VALUES ($1, $2, '2026-01-03', 'durchgefuehrt', 6) RETURNING id",
    [user.id, group.id]
  );
  const supervision = await one(
    `INSERT INTO supervision_sessions (user_id, supervisor_id, date, duration_minutes, kind)
     VALUES ($1, $2, '2026-01-04', 60, 'individual') RETURNING id`,
    [user.id, supervisor.id]
  );
  await client.query(
    "INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id) VALUES ($1, $2)",
    [supervision.id, therapySession.id]
  );
  return {
    userId: user.id,
    supervisorId: supervisor.id,
    patientId: patient.id,
    therapySessionId: therapySession.id,
    groupId: group.id,
    groupSessionId: groupSession.id,
    supervisionId: supervision.id,
  };
}

// Zwei Accounts mit je einer vollständigen Kette (Patient:in, Sitzung, Gruppe, Doppelstunde,
// Supervision mit Verknüpfung). Damit lässt sich jede Schreibfunktion gegen fremde IDs prüfen.
export async function seedOwnershipFixture(client: Client): Promise<OwnershipFixture> {
  return { a: await seedAccount(client, "A"), b: await seedAccount(client, "B") };
}

// Nur für Tests: table und where sind Konstanten aus dem Testcode, keine Nutzereingaben.
export async function countRows(client: Client, table: string, where = "", params: unknown[] = []): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table} ${where}`, params);
  return rows[0].n;
}
