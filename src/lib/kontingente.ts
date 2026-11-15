import type { Patient, SessionCategory, TherapySession } from "@/types";
import { quarterOf } from "./calculations";
import {
  ANAMNESE_JE_FALL,
  EXPLORATION_MINUTEN,
  EXPLORATIONEN_JE_QUARTAL,
  GESPRAECHSZIFFER_MINUTEN,
  GESPRAECHSZIFFERN_JE_QUARTAL,
  PROBATORIK_JE_FALL,
  SPRECHSTUNDE_MINUTEN,
  SPRECHSTUNDEN_JE_FALL,
  UNIT_MINUTES,
} from "./constants";

// Kontingente je Fall (#66): wie viel von Sprechstunde, Probatorik und Gesprächsziffern schon genutzt ist. Nur Hinweise –
// Überziehen ist möglich und wird angezeigt, nicht verhindert. Minuten erst summieren, dann einmal teilen.
export interface Kontingent {
  genutzt: number;
  verfuegbar: number;
}

function minutenIn(patient: Patient, sessions: TherapySession[], category: SessionCategory, filter?: (s: TherapySession) => boolean) {
  return sessions
    .filter((s) => s.patientId === patient.id && s.category === category && (filter?.(s) ?? true))
    .reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function sprechstundenKontingent(patient: Patient, sessions: TherapySession[]): Kontingent {
  return {
    genutzt: minutenIn(patient, sessions, "sprechstunde") / SPRECHSTUNDE_MINUTEN,
    verfuegbar: SPRECHSTUNDEN_JE_FALL - patient.sprechstundenAmbulanz,
  };
}

export function probatorikKontingent(patient: Patient, sessions: TherapySession[]): Kontingent {
  return { genutzt: minutenIn(patient, sessions, "probatorik") / UNIT_MINUTES, verfuegbar: PROBATORIK_JE_FALL };
}

// Gesprächsziffern gelten je Quartal: gezählt wird das Quartal des Stichtags (in der App: heute).
export function gespraechsziffernKontingent(patient: Patient, sessions: TherapySession[], stichtag: string): Kontingent {
  const quartal = quarterOf(stichtag);
  return {
    genutzt: minutenIn(patient, sessions, "gespraechsziffer", (s) => quarterOf(s.date) === quartal) / GESPRAECHSZIFFER_MINUTEN,
    verfuegbar: GESPRAECHSZIFFERN_JE_QUARTAL,
  };
}

export function anamneseKontingent(patient: Patient, sessions: TherapySession[]): Kontingent {
  return { genutzt: minutenIn(patient, sessions, "anamnese") / UNIT_MINUTES, verfuegbar: ANAMNESE_JE_FALL };
}

// Vertiefte Exploration gilt wie die Gesprächsziffern je Quartal des Stichtags.
export function explorationKontingent(patient: Patient, sessions: TherapySession[], stichtag: string): Kontingent {
  const quartal = quarterOf(stichtag);
  return {
    genutzt: minutenIn(patient, sessions, "exploration", (s) => quarterOf(s.date) === quartal) / EXPLORATION_MINUTEN,
    verfuegbar: EXPLORATIONEN_JE_QUARTAL,
  };
}

// Alle Kontingente eines Falls zum Stichtag, je Kategorie – für Hinweise beim Erfassen. Behandlung und Bezugsperson
// laufen über den Antrag (calculations.ts), nicht hier.
export type KategorieKontingente = Partial<Record<SessionCategory, Kontingent>>;

export function kontingenteJeKategorie(patient: Patient, sessions: TherapySession[], stichtag: string): KategorieKontingente {
  return {
    sprechstunde: sprechstundenKontingent(patient, sessions),
    probatorik: probatorikKontingent(patient, sessions),
    anamnese: anamneseKontingent(patient, sessions),
    gespraechsziffer: gespraechsziffernKontingent(patient, sessions, stichtag),
    exploration: explorationKontingent(patient, sessions, stichtag),
  };
}

// Ausgeschöpft: genutzt ≥ verfügbar (mit Toleranz für Rundung der Minuten).
export function ausgeschoepft(k: Kontingent): boolean {
  return k.genutzt >= k.verfuegbar - 1e-9;
}
