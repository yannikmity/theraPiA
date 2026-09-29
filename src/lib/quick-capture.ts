import type { Patient, PatientId, SessionCategory, TherapySession, TherapySessionId } from "@/types";
import { LAST_WEEK_SHIFT_DAYS } from "./constants";
import { compareNatural } from "./collation";
import { addDaysIso } from "./dates";

// Reine Helfer der Schnellerfassung (#5): Vorbelegung des Formulars und Vorschläge „Wie letzte Woche“.
// Ohne Datenbank, damit Seite und Tests dieselbe Logik nutzen.

export type CaptureType = "therapie" | "supervision";

// Neueste zuerst; bei gleichem Datum bleibt die Reihenfolge der Eingabe (getTherapySessions liefert jüngst
// angelegte zuerst) – Array.prototype.sort ist stabil.
function newestFirst(sessions: TherapySession[]): TherapySession[] {
  return [...sessions].sort((a, b) => b.date.localeCompare(a.date));
}

// Zuletzt genutzte aktive Patient:in – Vorbelegung der Auswahl im Erfassen-Formular.
export function lastUsedPatientId(sessions: TherapySession[], patients: Patient[]): PatientId | null {
  const active = new Set(patients.filter((p) => p.isActive).map((p) => p.id));
  return newestFirst(sessions).find((s) => active.has(s.patientId))?.patientId ?? null;
}

// Letzte Kategorie je Patient:in: nach der Probatorik folgt meist Behandlung – die Vorbelegung folgt der letzten Sitzung.
export function lastCategoryByPatient(sessions: TherapySession[]): Record<string, SessionCategory> {
  const result: Record<string, SessionCategory> = {};
  for (const s of newestFirst(sessions)) {
    if (!(s.patientId in result)) result[s.patientId] = s.category;
  }
  return result;
}

// Welche Patient:in ist beim Öffnen gewählt? Adresse (?patient=…) vor zuletzt genutzter vor erster aktiver.
// Nur aktive Patient:innen sind wählbar; alles andere fällt durch.
export function resolveInitialPatientId(
  requested: string | undefined,
  activePatients: Patient[],
  lastUsed: PatientId | null
): string {
  if (requested && activePatients.some((p) => p.id === requested)) return requested;
  if (lastUsed && activePatients.some((p) => p.id === lastUsed)) return lastUsed;
  return activePatients[0]?.id ?? "";
}

export function resolveInitialType(requested: string | undefined): CaptureType {
  return requested === "supervision" ? "supervision" : "therapie";
}

export interface LastWeekSuggestion {
  sourceSessionId: TherapySessionId;
  patientId: PatientId;
  chiffre: string;
  sourceDate: string; // YYYY-MM-DD, die Sitzung der Vorwoche
  date: string; // sourceDate + LAST_WEEK_SHIFT_DAYS – gleicher Wochentag, nie nach heute
  durationMinutes: number;
  category: SessionCategory;
}

// „Wie letzte Woche“: Sitzungen von vor 7 bis 13 Tagen, um eine Woche verschoben – das Ziel liegt zwischen vor
// 6 Tagen und heute, nie in der Zukunft. Ausgelassen: abgeschlossene Behandlungen und Ziele, für die es am Tag
// schon eine Sitzung derselben Patient:in gibt (auch untereinander: eine Zeile je Patient:in und Tag, die erste
// in der Liste gewinnt). Der Server prüft Doppelte beim Speichern noch einmal (therapySessionExists).
export function lastWeekSuggestions(sessions: TherapySession[], patients: Patient[], today: string): LastWeekSuggestion[] {
  const from = addDaysIso(today, -(2 * LAST_WEEK_SHIFT_DAYS - 1));
  const to = addDaysIso(today, -LAST_WEEK_SHIFT_DAYS);
  const chiffreOfActive = new Map(patients.filter((p) => p.isActive).map((p): [string, string] => [p.id, p.chiffre]));
  const existing = new Set(sessions.map((s) => `${s.patientId}|${s.date}`));
  const seen = new Set<string>();
  const suggestions: LastWeekSuggestion[] = [];
  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    const chiffre = chiffreOfActive.get(s.patientId);
    if (chiffre === undefined) continue;
    const date = addDaysIso(s.date, LAST_WEEK_SHIFT_DAYS);
    const key = `${s.patientId}|${date}`;
    if (existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      sourceSessionId: s.id,
      patientId: s.patientId,
      chiffre,
      sourceDate: s.date,
      date,
      durationMinutes: s.durationMinutes,
      category: s.category,
    });
  }
  return suggestions.sort((a, b) => a.date.localeCompare(b.date) || compareNatural(a.chiffre, b.chiffre));
}
