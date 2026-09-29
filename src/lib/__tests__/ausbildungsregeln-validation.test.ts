// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  abweichungenSchema,
  ebmStaffelSchema,
  instanzprofilSchema,
  MELDUNG_AMBULANZZEIT,
  MELDUNG_ANTEIL,
  MELDUNG_KINDERZAHLEN,
  MELDUNG_KRITISCH,
  MELDUNG_PAAR,
} from "../ausbildungsregeln/validation";

type Ergebnis = { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } };
const pfade = (r: Ergebnis) => (r.success ? [] : r.error!.issues.map((i) => i.path.join(".")));
const meldungen = (r: Ergebnis) => (r.success ? [] : r.error!.issues.map((i) => i.message));

const PROFIL = {
  behandlungsstundenZiel: 600,
  svEinheitenZiel: 150,
  verhaeltnisWarnung: 4,
  verhaeltnisKritisch: 5,
  gruppeDoppelstundenZiel: 60,
  gruppeAmbulanzzeitZiel: 40,
};
const ERBT_ALLES = {
  behandlungsstundenZiel: null,
  svEinheitenZiel: null,
  verhaeltnisWarnung: null,
  verhaeltnisKritisch: null,
  gruppeDoppelstundenZiel: null,
  gruppeAmbulanzzeitZiel: null,
};
const STAFFEL = {
  id: null,
  gueltigAb: "2027-01-01",
  stufen: [
    { kinderzahl: 3, total: 180, share: 90 },
    { kinderzahl: 4, total: 205, share: 102.5 },
  ],
};

describe("instanzprofilSchema", () => {
  it("akzeptiert die Standardwerte und Verhältnisse mit einer Nachkommastelle", () => {
    expect(instanzprofilSchema.safeParse(PROFIL).success).toBe(true);
    expect(instanzprofilSchema.safeParse({ ...PROFIL, verhaeltnisWarnung: 3.5, verhaeltnisKritisch: 4.5 }).success).toBe(true);
  });

  it("lehnt Nullziele, Kommazahlen bei Zielen, zu große Werte und zwei Nachkommastellen ab", () => {
    expect(pfade(instanzprofilSchema.safeParse({ ...PROFIL, behandlungsstundenZiel: 0 }))).toContain("behandlungsstundenZiel");
    expect(pfade(instanzprofilSchema.safeParse({ ...PROFIL, behandlungsstundenZiel: 600.5 }))).toContain("behandlungsstundenZiel");
    expect(pfade(instanzprofilSchema.safeParse({ ...PROFIL, svEinheitenZiel: 1001 }))).toContain("svEinheitenZiel");
    expect(pfade(instanzprofilSchema.safeParse({ ...PROFIL, verhaeltnisWarnung: 3.55 }))).toContain("verhaeltnisWarnung");
    expect(pfade(instanzprofilSchema.safeParse({ ...PROFIL, gruppeDoppelstundenZiel: 501 }))).toContain("gruppeDoppelstundenZiel");
  });

  it("meldet ein leeres Feld (NaN) verständlich", () => {
    expect(meldungen(instanzprofilSchema.safeParse({ ...PROFIL, svEinheitenZiel: Number.NaN }))).toContain("Bitte eine Zahl eingeben");
  });

  it("verlangt kritisch über dem Soll und Ambulanzzeit höchstens so hoch wie die Doppelstunden", () => {
    const gleich = instanzprofilSchema.safeParse({ ...PROFIL, verhaeltnisKritisch: 4 });
    expect(pfade(gleich)).toContain("verhaeltnisKritisch");
    expect(meldungen(gleich)).toContain(MELDUNG_KRITISCH);
    const mehr = instanzprofilSchema.safeParse({ ...PROFIL, gruppeAmbulanzzeitZiel: 61 });
    expect(pfade(mehr)).toContain("gruppeAmbulanzzeitZiel");
    expect(meldungen(mehr)).toContain(MELDUNG_AMBULANZZEIT);
    expect(instanzprofilSchema.safeParse({ ...PROFIL, gruppeAmbulanzzeitZiel: 60 }).success).toBe(true);
  });
});

describe("abweichungenSchema", () => {
  it("alles null ist gültig (erbt alles), einzelne Ziele ohne Paar auch", () => {
    expect(abweichungenSchema.safeParse(ERBT_ALLES).success).toBe(true);
    expect(abweichungenSchema.safeParse({ ...ERBT_ALLES, behandlungsstundenZiel: 450 }).success).toBe(true);
    expect(abweichungenSchema.safeParse({ ...ERBT_ALLES, verhaeltnisWarnung: 3, verhaeltnisKritisch: 4 }).success).toBe(true);
  });

  it("markiert bei einem halben Paar das fehlende Feld", () => {
    const soll = abweichungenSchema.safeParse({ ...ERBT_ALLES, verhaeltnisWarnung: 3 });
    expect(pfade(soll)).toEqual(["verhaeltnisKritisch"]);
    expect(meldungen(soll)).toEqual([MELDUNG_PAAR]);
    expect(pfade(abweichungenSchema.safeParse({ ...ERBT_ALLES, gruppeAmbulanzzeitZiel: 30 }))).toEqual(["gruppeDoppelstundenZiel"]);
  });

  it("prüft auch persönlich kritisch > Soll und Ambulanzzeit ≤ Doppelstunden", () => {
    expect(pfade(abweichungenSchema.safeParse({ ...ERBT_ALLES, verhaeltnisWarnung: 5, verhaeltnisKritisch: 5 }))).toContain("verhaeltnisKritisch");
    expect(pfade(abweichungenSchema.safeParse({ ...ERBT_ALLES, gruppeDoppelstundenZiel: 30, gruppeAmbulanzzeitZiel: 31 }))).toContain(
      "gruppeAmbulanzzeitZiel"
    );
  });

  it("verwirft unbekannte Felder wie eine mitgeschickte User-ID", () => {
    const r = abweichungenSchema.safeParse({ ...ERBT_ALLES, userId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("userId");
  });
});

describe("ebmStaffelSchema", () => {
  it("akzeptiert eine neue und eine bestehende Staffel", () => {
    expect(ebmStaffelSchema.safeParse(STAFFEL).success).toBe(true);
    expect(ebmStaffelSchema.safeParse({ ...STAFFEL, id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
  });

  it("verlangt lückenlos aufsteigende, eindeutige Kinderzahlen", () => {
    const stufe = (kinderzahl: number) => ({ kinderzahl, total: 100, share: 50 });
    for (const zahlen of [[3, 5], [4, 3], [3, 3]]) {
      const r = ebmStaffelSchema.safeParse({ ...STAFFEL, stufen: zahlen.map(stufe) });
      expect(pfade(r)).toContain("stufen");
      expect(meldungen(r)).toContain(MELDUNG_KINDERZAHLEN);
    }
  });

  it("prüft Anteil ≤ Gesamthonorar, Cent-Genauigkeit und Grenzen", () => {
    const anteil = ebmStaffelSchema.safeParse({ ...STAFFEL, stufen: [{ kinderzahl: 3, total: 180, share: 181 }] });
    expect(pfade(anteil)).toContain("stufen.0.share");
    expect(meldungen(anteil)).toContain(MELDUNG_ANTEIL);
    expect(pfade(ebmStaffelSchema.safeParse({ ...STAFFEL, stufen: [{ kinderzahl: 3, total: 180.001, share: 90 }] }))).toContain("stufen.0.total");
    expect(pfade(ebmStaffelSchema.safeParse({ ...STAFFEL, stufen: [{ kinderzahl: 0, total: 180, share: 90 }] }))).toContain("stufen.0.kinderzahl");
    expect(pfade(ebmStaffelSchema.safeParse({ ...STAFFEL, stufen: [] }))).toContain("stufen");
  });

  it("prüft das Datum als echten Kalendertag", () => {
    expect(pfade(ebmStaffelSchema.safeParse({ ...STAFFEL, gueltigAb: "2027-02-30" }))).toContain("gueltigAb");
    expect(pfade(ebmStaffelSchema.safeParse({ ...STAFFEL, gueltigAb: "01.01.2027" }))).toContain("gueltigAb");
  });

  it("weist Jahre vor 1900 am Feld ab, damit die Datenbank nie am Datum scheitert", () => {
    for (const gueltigAb of ["0000-01-01", "0001-01-01", "1899-12-31"]) {
      expect(pfade(ebmStaffelSchema.safeParse({ ...STAFFEL, gueltigAb }))).toEqual(["gueltigAb"]);
    }
    expect(ebmStaffelSchema.safeParse({ ...STAFFEL, gueltigAb: "1900-01-01" }).success).toBe(true);
  });
});
