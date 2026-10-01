import type { SessionCategory } from "@/types";

// Ausbildungseinheiten: Behandlungsstunden und Supervision zählen in Einheiten zu 50 Minuten, nicht in Uhrzeit-Stunden.
// Doppelstunden der Gruppe (à 100 Min) zählen gesondert, nicht zu den Behandlungsstunden. Gespeichert werden Minuten;
// umgerechnet wird nur in calculations.minutesToUnits. „Hours“ in Code und Typen meint diese Einheiten.
// Ziele, Verhältnis-Schwellen, Gruppenziele und EBM-Staffel sind pflegbare Ausbildungsregeln (src/lib/ausbildungsregeln).
export const UNIT_MINUTES = 50;

// Auth
export const MIN_PASSWORD_LENGTH = 10;
export const BCRYPT_SALT_ROUNDS = 12;
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
// Adresse einer nie eingelösten Einladung: 30 Tage nach Ablauf entfernen (Person ohne Account, kein Zweck mehr).
export const INVITATION_EMAIL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
// Selbst angeforderter Reset-Link (Passwort vergessen): kurz gültig, die Mail kommt sofort an. Der Link aus der
// Administration bleibt bei RESET_TOKEN_TTL_MS, weil er von Hand weitergegeben wird.
export const SELF_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// Anfragen „Passwort vergessen“ pro Zeitfenster: pro Client und zusätzlich pro Adresse über alle Clients.
export const FORGOT_WINDOW_MINUTES = 60;
export const FORGOT_LIMIT_PER_CLIENT = 5;
export const FORGOT_LIMIT_PER_EMAIL = 3;
// Anmeldeversuche pro Zeitfenster: pro Client+Adresse und zusätzlich pro Adresse über alle Clients.
export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_LIMIT_PER_CLIENT = 10;
export const LOGIN_LIMIT_PER_EMAIL = 20;
// Erneute Passworteingabe (Passwort ändern, Account löschen): Versuche pro Account und Zeitfenster.
export const PASSWORD_CHECK_WINDOW_MINUTES = 15;
export const PASSWORD_CHECK_LIMIT = 5;
// Sitzung: nach 7 Tagen ohne Nutzung abgemeldet; bei JWT-Sitzungen (@auth/core 0.41) wird das Cookie
// bei jeder Anfrage über den Proxy neu ausgestellt. UPDATE_AGE wirkt nur bei Datenbank-Sitzungen und
// ist zur Klarheit und für einen späteren Wechsel explizit gesetzt.
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

// Dashboard
export const DASHBOARD_RECENT_ENTRIES = 5;

// Erfassen: Vorgaben und Sammel-Speichern („Wie letzte Woche“). Dauern laufen in der Praxis in 25-Minuten-Schritten
// (#64); andere Werte bleiben über „Andere“ möglich.
export const DEFAULT_THERAPY_SESSION_MINUTES = 50;
export const DEFAULT_SUPERVISION_MINUTES = 50;
export const DURATION_PRESETS_MINUTES = [25, 50, 75, 100];
// Gesprächsziffern werden in 10-Minuten-Schritten abgerechnet (#66); alle anderen Kategorien im 25er-Raster (#64).
export const GESPRAECHSZIFFER_PRESETS_MINUTES = [10, 20, 30, 40, 50];
export function durationPresetsFor(category: SessionCategory | null): number[] {
  return category === "gespraechsziffer" ? GESPRAECHSZIFFER_PRESETS_MINUTES : DURATION_PRESETS_MINUTES;
}

// Kontingente je Fall (#66), bundesweit nach Psychotherapie-Richtlinie/EBM – deshalb fest statt pflegbar.
export const SPRECHSTUNDEN_JE_FALL = 10; // Termine à SPRECHSTUNDE_MINUTEN
export const SPRECHSTUNDE_MINUTEN = 25;
export const PROBATORIK_JE_FALL = 6; // Sitzungen à UNIT_MINUTES
export const GESPRAECHSZIFFERN_JE_QUARTAL = 15; // je Fall, à GESPRAECHSZIFFER_MINUTEN
export const GESPRAECHSZIFFER_MINUTEN = 10;

export const LAST_WEEK_SHIFT_DAYS = 7;
export const MAX_SESSIONS_PER_BATCH = 50;

// Quartalsprognose (Dashboard): Rückblick für den Schnitt, Obergrenze der geplanten Sitzungen pro Woche
export const FORECAST_LOOKBACK_WEEKS = 8;
export const PLANNED_SESSIONS_PER_WEEK_MAX = 60;

// Gruppenfachkunde
export const GROUP_SESSION_DURATION_MINUTES = 100;
