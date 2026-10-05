import {
  Patient,
  Supervisor,
  TherapySession,
  SupervisionSession,
  Group,
  GroupSession,
  PatientId,
  SupervisorId,
  TherapySessionId,
  SupervisionSessionId,
  GroupId,
  GroupSessionId,
} from "@/types";

function toISOString(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

// Raw DB row interfaces (snake_case). DATE-Spalten sind YYYY-MM-DD-Strings, NUMERIC-Spalten Zahlen (siehe pg-types.ts).
export interface PatientRow {
  id: string;
  chiffre: string;
  therapy_type: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string | Date;
  antragsdatum: string | null;
  beantragte_stunden: number | null;
  genehmigungsdatum: string | null;
  sprechstunden_ambulanz: number;
}

export interface SupervisorRow {
  id: string;
  name: string;
  cost_per_hour: number | null;
  is_active: boolean;
}

export interface TherapySessionRow {
  id: string;
  patient_id: string;
  date: string;
  duration_minutes: number;
  notes: string;
  category: string;
}

export interface SupervisionSessionRow {
  id: string;
  supervisor_id: string;
  date: string;
  duration_minutes: number;
  kind: string;
  setting: string;
}

export interface GroupRow {
  id: string;
  name: string;
  start_date: string;
  planned_session_count: number;
  avg_kids: number | null;
  is_active: boolean;
  created_at: string | Date;
}

export interface GroupSessionRow {
  id: string;
  group_id: string;
  date: string;
  status: string;
  child_count: number | null;
  counts_toward_ambulanzzeit: boolean;
  duration_minutes: number;
  notes: string;
}

// Mapper functions
export function mapPatientRow(row: PatientRow): Patient {
  return {
    id: row.id as PatientId,
    chiffre: row.chiffre,
    therapyType: row.therapy_type as Patient["therapyType"],
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    createdAt: toISOString(row.created_at),
    antragsdatum: row.antragsdatum,
    beantragteStunden: row.beantragte_stunden,
    genehmigungsdatum: row.genehmigungsdatum,
    sprechstundenAmbulanz: row.sprechstunden_ambulanz,
  };
}

export function mapSupervisorRow(row: SupervisorRow): Supervisor {
  return {
    id: row.id as SupervisorId,
    name: row.name,
    costPerHour: row.cost_per_hour,
    isActive: row.is_active,
  };
}

export function mapTherapySessionRow(row: TherapySessionRow): TherapySession {
  return {
    id: row.id as TherapySessionId,
    patientId: row.patient_id as PatientId,
    date: row.date,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    category: row.category as TherapySession["category"],
  };
}

export function mapSupervisionSessionRow(
  row: SupervisionSessionRow,
  linkedTherapySessionIds: TherapySessionId[],
  linkedGroupSessionIds: GroupSessionId[] = []
): SupervisionSession {
  return {
    id: row.id as SupervisionSessionId,
    supervisorId: row.supervisor_id as SupervisorId,
    date: row.date,
    durationMinutes: row.duration_minutes,
    kind: row.kind as SupervisionSession["kind"],
    setting: row.setting as SupervisionSession["setting"],
    linkedTherapySessionIds,
    linkedGroupSessionIds,
  };
}

export function mapGroupRow(row: GroupRow): Group {
  return {
    id: row.id as GroupId,
    name: row.name,
    startDate: row.start_date,
    plannedSessionCount: row.planned_session_count,
    avgKids: row.avg_kids,
    isActive: row.is_active,
    createdAt: toISOString(row.created_at),
  };
}

export function mapGroupSessionRow(row: GroupSessionRow): GroupSession {
  return {
    id: row.id as GroupSessionId,
    groupId: row.group_id as GroupId,
    date: row.date,
    status: row.status as GroupSession["status"],
    childCount: row.child_count,
    countsTowardAmbulanzzeit: row.counts_toward_ambulanzzeit,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
  };
}
