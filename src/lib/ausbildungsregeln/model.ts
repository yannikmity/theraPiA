import { formatVerhaeltnis } from "../format";

// Ausbildungsregeln (#8): Stundenziele, Verhältnis-Schwellen und Gruppenziele. Pro Instanz pflegt die Administration ein
// Ausbildungsprofil, pro Account gibt es persönliche Abweichungen (NULL = erbt). Ohne Datenbankzeile gelten die
// Standardwerte unten – die früher festen Werte. „Stunden“ meint Einheiten à UNIT_MINUTES (constants.ts).
export interface Ausbildungsregeln {
  behandlungsstundenZiel: number; // Behandlungsstunden à 50 Min, alle Kategorien
  svEinheitenZiel: number; // SV-Einheiten à 50 Min
  verhaeltnisWarnung: number; // Soll 1 : x – darüber „Knapp“
  verhaeltnisKritisch: number; // darüber „Supervision fehlt“; immer > verhaeltnisWarnung
  gruppeDoppelstundenZiel: number; // Doppelstunden der Gruppe (à 100 Min), zählen nicht zu den Behandlungsstunden
  gruppeAmbulanzzeitZiel: number; // davon in der Ambulanzzeit; immer <= gruppeDoppelstundenZiel
}

export type RegelFeld = keyof Ausbildungsregeln;

export const REGEL_FELDER: RegelFeld[] = [
  "behandlungsstundenZiel",
  "svEinheitenZiel",
  "verhaeltnisWarnung",
  "verhaeltnisKritisch",
  "gruppeDoppelstundenZiel",
  "gruppeAmbulanzzeitZiel",
];

export type RegelAbweichungen = { [K in RegelFeld]: number | null };

export const KEINE_ABWEICHUNGEN: RegelAbweichungen = {
  behandlungsstundenZiel: null,
  svEinheitenZiel: null,
  verhaeltnisWarnung: null,
  verhaeltnisKritisch: null,
  gruppeDoppelstundenZiel: null,
  gruppeAmbulanzzeitZiel: null,
};

// Paare werden nur gemeinsam überschrieben – sonst könnte eine spätere Änderung des Instanzprofils eine persönliche
// Kombination ungültig machen (persönlich Soll 6, Instanz kritisch 5).
export const REGEL_PAARE: [RegelFeld, RegelFeld][] = [
  ["verhaeltnisWarnung", "verhaeltnisKritisch"],
  ["gruppeDoppelstundenZiel", "gruppeAmbulanzzeitZiel"],
];

export interface RegelGruppe {
  id: "behandlung" | "supervision" | "verhaeltnis" | "gruppe";
  titel: string;
  hinweis: string;
  felder: RegelFeld[];
}

// Gruppen = Einheiten der Pflege: eine Gruppe wird persönlich ganz oder gar nicht überschrieben.
export const REGEL_GRUPPEN: RegelGruppe[] = [
  { id: "behandlung", titel: "Behandlungsstunden", hinweis: "Einheiten à 50 Minuten, alle Kategorien zusammen.", felder: ["behandlungsstundenZiel"] },
  { id: "supervision", titel: "Supervision", hinweis: "SV-Einheiten à 50 Minuten.", felder: ["svEinheitenZiel"] },
  {
    id: "verhaeltnis",
    titel: "Verhältnis Supervision : Therapie",
    hinweis: "Über dem Soll zeigt die App „Knapp“, über der kritischen Schwelle „Supervision fehlt“.",
    felder: ["verhaeltnisWarnung", "verhaeltnisKritisch"],
  },
  {
    id: "gruppe",
    titel: "Fachkunde Gruppe",
    hinweis: "Doppelstunden à 100 Minuten; sie zählen nicht zu den Behandlungsstunden.",
    felder: ["gruppeDoppelstundenZiel", "gruppeAmbulanzzeitZiel"],
  },
];

export const REGEL_LABELS: Record<RegelFeld, string> = {
  behandlungsstundenZiel: "Ziel Behandlungsstunden",
  svEinheitenZiel: "Ziel SV-Einheiten",
  verhaeltnisWarnung: "Soll-Verhältnis",
  verhaeltnisKritisch: "Kritisch ab",
  gruppeDoppelstundenZiel: "Ziel Doppelstunden",
  gruppeAmbulanzzeitZiel: "davon in Ambulanzzeit",
};

export function istVerhaeltnisFeld(feld: RegelFeld): boolean {
  return feld === "verhaeltnisWarnung" || feld === "verhaeltnisKritisch";
}

export function formatRegelwert(feld: RegelFeld, wert: number): string {
  return istVerhaeltnisFeld(feld) ? `1 : ${formatVerhaeltnis(wert)}` : String(wert);
}

// EBM-Honorar-Staffel der Gruppe (Doppelstunde, 100 Min): je Kinderzahl Gesamthonorar und eigener Anteil in EUR.
// id null = Standardwerte aus dem Code (keine Datenbankzeile).
export interface EbmStufe {
  kinderzahl: number;
  total: number;
  share: number;
}

export interface EbmStaffel {
  id: string | null;
  gueltigAb: string; // YYYY-MM-DD
  stufen: EbmStufe[]; // aufsteigend und lückenlos nach Kinderzahl
}

// Wirksame Regeln einer Person: regeln = basis (Instanz oder Standard) mit den persönlichen Abweichungen.
export interface Regelwerk {
  regeln: Ausbildungsregeln;
  basis: Ausbildungsregeln;
  basisQuelle: "standard" | "instanz";
  abweichungen: RegelAbweichungen;
  abweichend: RegelFeld[]; // Felder mit persönlichem Wert, in REGEL_FELDER-Reihenfolge
  ebmStaffeln: EbmStaffel[]; // aufsteigend nach gueltigAb, mindestens eine
}

// Standardwerte = die bis #8 festen Konstanten. Nur über resolve.ts und den Service verwenden (regel-guard.test.ts).
export const DEFAULT_AUSBILDUNGSREGELN: Ausbildungsregeln = {
  behandlungsstundenZiel: 600,
  svEinheitenZiel: 150,
  verhaeltnisWarnung: 4,
  verhaeltnisKritisch: 5,
  gruppeDoppelstundenZiel: 60,
  gruppeAmbulanzzeitZiel: 40,
};

export const DEFAULT_EBM_STAFFELN: EbmStaffel[] = [
  {
    id: null,
    gueltigAb: "2000-01-01",
    stufen: [
      { kinderzahl: 3, total: 177, share: 88.5 },
      { kinderzahl: 4, total: 200, share: 100 },
      { kinderzahl: 5, total: 225, share: 112.5 },
      { kinderzahl: 6, total: 243, share: 121.5 },
      { kinderzahl: 7, total: 266, share: 133 },
      { kinderzahl: 8, total: 288, share: 144 },
      { kinderzahl: 9, total: 301.5, share: 150.75 },
    ],
  },
];

// Beschriftung der Eingabefelder: Verhältnisse werden als x in „1 : x“ eingegeben.
export function eingabeLabel(feld: RegelFeld): string {
  return istVerhaeltnisFeld(feld) ? `${REGEL_LABELS[feld]} (1 : x)` : REGEL_LABELS[feld];
}
