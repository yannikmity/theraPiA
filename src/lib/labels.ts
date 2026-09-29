import type { SessionCategory, SupervisionKind, GroupSessionStatus, TherapyType } from "@/types";

// Deutsche Bezeichnungen der Enum-Werte für Exporte und Nachweise. Die Record-Typen erzwingen
// Vollständigkeit: ein neuer Enum-Wert ohne Bezeichnung bricht den Typcheck.
export const CATEGORY_LABELS: Record<SessionCategory, string> = {
  sprechstunde: "Sprechstunde",
  probatorik: "Probatorik",
  behandlung: "Behandlung",
  bezugsperson: "Bezugsperson",
  gespraechsziffer: "Gesprächsziffer",
};

// Reihenfolge wie im Fall (Sprechstunde → Probatorik → Behandlung), Gesprächsziffer zuletzt (#66). Einzige Kategorienliste
// für Formulare, Dashboard und Nachweis.
export const CATEGORY_ORDER: readonly SessionCategory[] = ["sprechstunde", "probatorik", "behandlung", "bezugsperson", "gespraechsziffer"];

// Dashboard und Nachweis zeigen die drei ursprünglichen Kategorien immer, Sprechstunde und Gesprächsziffer nur mit
// Stunden (#66) – sonst leere Kacheln bzw. Nullen.
export const CATEGORIES_IMMER_SICHTBAR: readonly SessionCategory[] = ["probatorik", "behandlung", "bezugsperson"];

export function sichtbareKategorien(hours: Record<SessionCategory, number>): SessionCategory[] {
  return CATEGORY_ORDER.filter((c) => CATEGORIES_IMMER_SICHTBAR.includes(c) || hours[c] > 0);
}

export const SUPERVISION_KIND_LABELS: Record<SupervisionKind, string> = {
  individual: "Einzel",
  group: "Gruppe",
};

export const GROUP_SESSION_STATUS_LABELS: Record<GroupSessionStatus, string> = {
  durchgefuehrt: "durchgeführt",
  ausgefallen: "ausgefallen",
  urlaub: "Urlaub",
  geplant: "geplant",
};

export const THERAPY_TYPE_LABELS: Record<TherapyType, string> = {
  kurzzeittherapie: "Kurzzeittherapie",
  langzeittherapie: "Langzeittherapie",
};
