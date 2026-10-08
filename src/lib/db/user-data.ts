import type { Db } from "../db";
import type {
  Patient,
  Supervisor,
  TherapySession,
  SupervisionSession,
  Group,
  GroupSession,
  TherapySessionId,
  GroupSessionId,
} from "@/types";
import {
  mapPatientRow,
  mapSupervisorRow,
  mapTherapySessionRow,
  mapSupervisionSessionRow,
  mapGroupRow,
  mapGroupSessionRow,
  type PatientRow,
  type SupervisorRow,
  type TherapySessionRow,
  type GroupRow,
  type GroupSessionRow,
} from "../db-mappers";
import { compareNatural } from "../collation";
import { NotFoundError } from "../errors";
import type { Role } from "../registration-policy";

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string; // ISO-Zeitstempel
}

// Alle Fachdaten eines Accounts – Grundlage für Nachweis, CSV- und Datenexport.
export interface UserData {
  account: UserAccount;
  patients: Patient[];
  supervisors: Supervisor[];
  therapySessions: TherapySession[];
  supervisionSessions: SupervisionSession[];
  groups: Group[];
  groupSessions: GroupSession[];
  financialSettings: { incomePerHour: number; plannedSessionsPerWeek: number | null }; // null = automatisch
}

// Von der Person erzeugte Einladungen – ohne Token-Hash und ohne die einlösende Person.
export interface CreatedInvitation {
  email: string | null;
  role: Role;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

// Liest alles mit `WHERE user_id = $1`, nie über Joins auf fremde Zeilen. DECIMAL-Spalten liest pg als Zahl
// (siehe pg-types.ts). Feste Sortierung, damit Exporte reproduzierbar sind; Patient:innen, Supervisor:innen und Gruppen zusätzlich
// natürlich nach Chiffre bzw. Name (collation.ts, #51), die SQL-Reihenfolge ist die stabile Grundlage. Die Abfragen laufen
// nacheinander; einen gemeinsamen Stand haben sie nur in einem Snapshot – Aufrufer laden daher über withSnapshot (db.ts, #41).
export async function loadUserData(db: Db, userId: string): Promise<UserData> {
  const account = await db.query("SELECT id, email, name, role, created_at FROM users WHERE id = $1", [userId]);
  if (account.rows.length === 0) throw new NotFoundError("Account");
  const a = account.rows[0];

  const patients = await db.query(
    `SELECT id, chiffre, therapy_type, start_date, end_date, is_active, created_at, antragsdatum, beantragte_stunden,
            genehmigungsdatum, sprechstunden_ambulanz
     FROM patients WHERE user_id = $1 ORDER BY chiffre, created_at`,
    [userId]
  );
  const supervisors = await db.query(
    `SELECT id, name, cost_per_hour, is_active
     FROM supervisors WHERE user_id = $1 ORDER BY name, created_at`,
    [userId]
  );
  const therapySessions = await db.query(
    `SELECT id, patient_id, date, duration_minutes, notes, category
     FROM therapy_sessions WHERE user_id = $1 ORDER BY date, created_at`,
    [userId]
  );
  // Verknüpfungen nur auf eigene Zeilen: der LEFT JOIN auf therapy_sessions/group_sessions trägt die Besitzbedingung,
  // fremde Ziele werden NULL und fallen aus dem FILTER. Verknüpfungen entstehen zwar nur über
  // assertSupervisionOwnership – der Export prüft trotzdem selbst (Defense in Depth, #41).
  const supervisionSessions = await db.query(
    `SELECT ss.id, ss.supervisor_id, ss.date, ss.duration_minutes, ss.kind, ss.setting,
            COALESCE(array_agg(DISTINCT ts.id) FILTER (WHERE ts.id IS NOT NULL), '{}') AS linked_therapy_session_ids,
            COALESCE(array_agg(DISTINCT gs.id) FILTER (WHERE gs.id IS NOT NULL), '{}') AS linked_group_session_ids
     FROM supervision_sessions ss
     LEFT JOIN supervision_therapy_links stl ON stl.supervision_id = ss.id
     LEFT JOIN therapy_sessions ts ON ts.id = stl.therapy_session_id AND ts.user_id = $1
     LEFT JOIN supervision_group_session_links sgsl ON sgsl.supervision_id = ss.id
     LEFT JOIN group_sessions gs ON gs.id = sgsl.group_session_id AND gs.user_id = $1
     WHERE ss.user_id = $1
     GROUP BY ss.id, ss.supervisor_id, ss.date, ss.duration_minutes, ss.kind, ss.setting, ss.created_at
     ORDER BY ss.date, ss.created_at`,
    [userId]
  );
  const groups = await db.query(
    `SELECT id, name, start_date, planned_session_count, avg_kids, is_active, created_at
     FROM groups WHERE user_id = $1 ORDER BY name, created_at`,
    [userId]
  );
  const groupSessions = await db.query(
    `SELECT id, group_id, date, status, child_count, counts_toward_ambulanzzeit, duration_minutes, notes
     FROM group_sessions WHERE user_id = $1 ORDER BY date, created_at`,
    [userId]
  );
  const finances = await db.query(
    "SELECT income_per_hour, planned_sessions_per_week FROM financial_settings WHERE user_id = $1",
    [userId]
  );

  return {
    account: { id: a.id, email: a.email, name: a.name ?? "", role: a.role, createdAt: iso(a.created_at) },
    patients: patients.rows.map((r) => mapPatientRow(r as PatientRow)).sort((a, b) => compareNatural(a.chiffre, b.chiffre)),
    supervisors: supervisors.rows.map((r) => mapSupervisorRow(r as SupervisorRow)).sort((a, b) => compareNatural(a.name, b.name)),
    therapySessions: therapySessions.rows.map((r) => mapTherapySessionRow(r as TherapySessionRow)),
    supervisionSessions: supervisionSessions.rows.map((r) =>
      mapSupervisionSessionRow(
        r,
        r.linked_therapy_session_ids as TherapySessionId[],
        r.linked_group_session_ids as GroupSessionId[]
      )
    ),
    groups: groups.rows.map((r) => mapGroupRow(r as GroupRow)).sort((a, b) => compareNatural(a.name, b.name)),
    groupSessions: groupSessions.rows.map((r) => mapGroupSessionRow(r as GroupSessionRow)),
    financialSettings: {
      incomePerHour: finances.rows[0]?.income_per_hour ?? 0,
      plannedSessionsPerWeek: finances.rows[0]?.planned_sessions_per_week ?? null,
    },
  };
}

export async function loadCreatedInvitations(db: Db, userId: string): Promise<CreatedInvitation[]> {
  const { rows } = await db.query(
    "SELECT email, role, created_at, expires_at, used_at FROM invitations WHERE created_by = $1 ORDER BY created_at",
    [userId]
  );
  return rows.map((r) => ({
    email: r.email,
    role: r.role,
    createdAt: iso(r.created_at),
    expiresAt: iso(r.expires_at),
    usedAt: r.used_at === null ? null : iso(r.used_at),
  }));
}
