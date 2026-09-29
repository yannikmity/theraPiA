import { z } from "zod";
import { REGEL_PAARE, istVerhaeltnisFeld, type RegelFeld } from "./model";

// Grenzen der Ausbildungsregeln (#8): weit genug für jede Ausbildungsordnung, eng genug gegen Tippfehler (6000 statt
// 600). Ziel 0 ergäbe eine Division durch 0 in der Fortschrittsanzeige. Dieselben Grenzen stehen als CHECK in
// migrations/005_ausbildungsregeln.sql – beim Lockern beide Stellen ändern (neue Migration).
export const REGEL_GRENZEN: Record<RegelFeld, { min: number; max: number }> = {
  behandlungsstundenZiel: { min: 1, max: 2000 },
  svEinheitenZiel: { min: 1, max: 1000 },
  verhaeltnisWarnung: { min: 1, max: 20 },
  verhaeltnisKritisch: { min: 1, max: 20 },
  gruppeDoppelstundenZiel: { min: 1, max: 500 },
  gruppeAmbulanzzeitZiel: { min: 1, max: 500 },
};

export const MELDUNG_KRITISCH = "Die kritische Schwelle muss über dem Soll-Verhältnis liegen";
export const MELDUNG_AMBULANZZEIT = "Die Ambulanzzeit kann nicht mehr Doppelstunden verlangen als die Gruppe insgesamt";
export const MELDUNG_PAAR = "Bitte beide Werte angeben oder beide zurücksetzen";
export const MELDUNG_KINDERZAHLEN = "Kinderzahlen müssen lückenlos aufsteigen (z. B. 3, 4, 5 …)";
export const MELDUNG_ANTEIL = "Der eigene Anteil kann nicht über dem Gesamthonorar liegen";

// Float-sicher: 3,5 × 10 = 35 exakt, 180,001 × 100 liegt neben einer ganzen Zahl.
function hatHoechstensStellen(wert: number, stellen: number): boolean {
  const faktor = 10 ** stellen;
  return Math.abs(wert * faktor - Math.round(wert * faktor)) < 1e-6;
}

const zahl = () => z.number({ error: "Bitte eine Zahl eingeben" });

function regelwert(feld: RegelFeld) {
  const { min, max } = REGEL_GRENZEN[feld];
  const basis = zahl().min(min, `Mindestens ${min}`).max(max, `Höchstens ${max}`);
  return istVerhaeltnisFeld(feld)
    ? basis.refine((v) => hatHoechstensStellen(v, 1), "Höchstens eine Nachkommastelle")
    : basis.int("Bitte eine ganze Zahl eingeben");
}

const felder = {
  behandlungsstundenZiel: regelwert("behandlungsstundenZiel"),
  svEinheitenZiel: regelwert("svEinheitenZiel"),
  verhaeltnisWarnung: regelwert("verhaeltnisWarnung"),
  verhaeltnisKritisch: regelwert("verhaeltnisKritisch"),
  gruppeDoppelstundenZiel: regelwert("gruppeDoppelstundenZiel"),
  gruppeAmbulanzzeitZiel: regelwert("gruppeAmbulanzzeitZiel"),
};

type Paarwerte = {
  verhaeltnisWarnung: number | null;
  verhaeltnisKritisch: number | null;
  gruppeDoppelstundenZiel: number | null;
  gruppeAmbulanzzeitZiel: number | null;
};
const kritischUeberSoll = (r: Paarwerte) =>
  r.verhaeltnisWarnung === null || r.verhaeltnisKritisch === null || r.verhaeltnisKritisch > r.verhaeltnisWarnung;
const ambulanzzeitInnerhalb = (r: Paarwerte) =>
  r.gruppeDoppelstundenZiel === null || r.gruppeAmbulanzzeitZiel === null || r.gruppeAmbulanzzeitZiel <= r.gruppeDoppelstundenZiel;

// Ausbildungsprofil der Instanz (Administration): alle Felder Pflicht.
export const instanzprofilSchema = z
  .object(felder)
  .refine(kritischUeberSoll, { error: MELDUNG_KRITISCH, path: ["verhaeltnisKritisch"] })
  .refine(ambulanzzeitInnerhalb, { error: MELDUNG_AMBULANZZEIT, path: ["gruppeAmbulanzzeitZiel"] });

// Persönliche Abweichungen: jedes Feld null = erbt. Das Formular schickt immer alle sechs Felder (keine Defaults, wie die
// Bearbeiten-Schemas in validation.ts). Unbekannte Felder – etwa eine fremde User-ID – verwirft z.object; die Action
// nimmt die User-ID ohnehin nur aus der Sitzung.
export const abweichungenSchema = z
  .object({
    behandlungsstundenZiel: felder.behandlungsstundenZiel.nullable(),
    svEinheitenZiel: felder.svEinheitenZiel.nullable(),
    verhaeltnisWarnung: felder.verhaeltnisWarnung.nullable(),
    verhaeltnisKritisch: felder.verhaeltnisKritisch.nullable(),
    gruppeDoppelstundenZiel: felder.gruppeDoppelstundenZiel.nullable(),
    gruppeAmbulanzzeitZiel: felder.gruppeAmbulanzzeitZiel.nullable(),
  })
  .superRefine((r, ctx) => {
    for (const [a, b] of REGEL_PAARE) {
      if ((r[a] === null) !== (r[b] === null)) {
        ctx.addIssue({ code: "custom", message: MELDUNG_PAAR, path: [r[a] === null ? a : b] });
      }
    }
  })
  .refine(kritischUeberSoll, { error: MELDUNG_KRITISCH, path: ["verhaeltnisKritisch"] })
  .refine(ambulanzzeitInnerhalb, { error: MELDUNG_AMBULANZZEIT, path: ["gruppeAmbulanzzeitZiel"] });

const kalendertag = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Ungültiges Datum")
  // Jahr 0 besteht die Kalenderprüfung, Postgres lehnt es aber ab (22008) – früher als 1900 ist ohnehin ein Tippfehler.
  .refine((v) => Number(v.slice(0, 4)) >= 1900, "Bitte ein Datum ab 1900 angeben");

const betrag = () =>
  zahl()
    .min(0, "Nicht negativ")
    .max(10000, "Höchstens 10.000 EUR")
    .refine((v) => hatHoechstensStellen(v, 2), "Höchstens zwei Nachkommastellen");

const ebmStufeSchema = z
  .object({
    kinderzahl: zahl().int("Bitte eine ganze Zahl eingeben").min(1, "Mindestens 1").max(30, "Höchstens 30"),
    total: betrag(),
    share: betrag(),
  })
  .refine((s) => s.share <= s.total, { error: MELDUNG_ANTEIL, path: ["share"] });

// Eine Staffel: Gültigkeitsbeginn (eindeutig – prüft die Datenbank, der Service meldet es am Feld) und Stufen mit
// lückenlos aufsteigenden Kinderzahlen (damit eindeutig). id null = neue Staffel.
export const ebmStaffelSchema = z
  .object({
    id: z.uuid().nullable(),
    gueltigAb: kalendertag,
    stufen: z.array(ebmStufeSchema).min(1, "Mindestens eine Stufe").max(30, "Höchstens 30 Stufen"),
  })
  .refine((s) => s.stufen.every((st, i) => i === 0 || st.kinderzahl === s.stufen[i - 1].kinderzahl + 1), {
    error: MELDUNG_KINDERZAHLEN,
    path: ["stufen"],
  });

export const ebmStaffelLoeschenSchema = z.object({ id: z.uuid() });
