import type { Patient, SessionCategory, TherapySession } from "@/types";
import { quarterOf } from "./calculations";
import {
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
