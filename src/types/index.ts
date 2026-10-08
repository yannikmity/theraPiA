// Branded ID types — zero-cost at runtime, prevents mix-ups at compile time
type Brand<T, B> = T & { readonly __brand: B };

export type PatientId = Brand<string, "PatientId">;
export type SupervisorId = Brand<string, "SupervisorId">;
export type TherapySessionId = Brand<string, "TherapySessionId">;
export type SupervisionSessionId = Brand<string, "SupervisionSessionId">;
export type GroupId = Brand<string, "GroupId">;
export type GroupSessionId = Brand<string, "GroupSessionId">;
export type UserId = Brand<string, "UserId">;

// ID factory functions
export const newPatientId = (id: string) => id as PatientId;
export const newSupervisorId = (id: string) => id as SupervisorId;
export const newTherapySessionId = (id: string) => id as TherapySessionId;
export const newSupervisionSessionId = (id: string) => id as SupervisionSessionId;
export const newGroupId = (id: string) => id as GroupId;
export const newGroupSessionId = (id: string) => id as GroupSessionId;
export const newUserId = (id: string) => id as UserId;

export type TherapyType = "kurzzeittherapie" | "langzeittherapie";
export type SessionCategory = "sprechstunde" | "probatorik" | "behandlung" | "bezugsperson" | "gespraechsziffer";
export type SupervisionKind = "individual" | "group";
export type SupervisionSetting = "einzel" | "gruppe";
export type GroupSessionStatus = "durchgefuehrt" | "ausgefallen" | "urlaub" | "geplant";

export interface Patient {
  id: PatientId;
  chiffre: string;
  therapyType: TherapyType;
  startDate: string; // ISO date
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  antragsdatum: string | null; // ISO date - Datum der LZT/KZT-Beantragung
  beantragteStunden: number | null; // beantragte Behandlungsstunden à 50 Min (Antrags-Kontingent), ganze Zahl
  genehmigungsdatum: string | null; // ISO date – ab hier zählt das Antrags-Kontingent (#66); null = ab Antragsdatum
  sprechstundenAmbulanz: number; // Sprechstunden-Termine dieses Falls, die die Ambulanzleitung übernimmt (0–10)
}

export interface Supervisor {
  id: SupervisorId;
  name: string;
  costPerHour: number | null;
  isActive: boolean;
}

export interface TherapySession {
  id: TherapySessionId;
  patientId: PatientId;
  date: string; // ISO date
  durationMinutes: number;
  notes: string;
  category: SessionCategory;
}

export interface SupervisionSession {
  id: SupervisionSessionId;
  supervisorId: SupervisorId;
  date: string; // ISO date
  durationMinutes: number;
  kind: SupervisionKind;
  setting: SupervisionSetting; // einzeln oder in der Gruppe wahrgenommen
  linkedTherapySessionIds: TherapySessionId[];
  linkedGroupSessionIds: GroupSessionId[];
  // Anteil je besprochenem Fall (#40), nur bei Supervisionen von Einzeltherapien. Gibt es Anteile, ist
  // durationMinutes ihre Summe; die Links auf Therapiesitzungen ändern daran nichts.
  caseShares: SupervisionCaseShare[];
}

export interface SupervisionCaseShare {
  patientId: PatientId;
  minutes: number;
}

export interface Group {
  id: GroupId;
  name: string;
  startDate: string; // ISO date
  plannedSessionCount: number;
  avgKids: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface GroupSession {
  id: GroupSessionId;
  groupId: GroupId;
  date: string; // ISO date
  status: GroupSessionStatus;
  childCount: number | null;
  countsTowardAmbulanzzeit: boolean;
  durationMinutes: number;
  notes: string;
}

export interface FinancialSettings {
  incomePerHour: number;
  supervisionCosts: Record<SupervisorId, number>;
  plannedSessionsPerWeek: number | null; // Quartalsprognose; null = Schnitt der letzten Wochen
}

// Schreibform der Finanz-Einstellungen (Formular, Actions). supervisionCosts kommt mit rohen String-Schlüsseln.
// plannedSessionsPerWeek: fehlt das Feld, bleibt der gespeicherte Wert erhalten; null setzt auf „Schnitt“ zurück.
export interface FinancialSettingsUpdate {
  incomePerHour: number;
  supervisionCosts: Record<string, number>;
  plannedSessionsPerWeek?: number | null;
}
