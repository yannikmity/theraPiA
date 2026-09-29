// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DEFAULT_AUSBILDUNGSREGELN,
  DEFAULT_EBM_STAFFELN,
  KEINE_ABWEICHUNGEN,
  REGEL_FELDER,
  REGEL_GRUPPEN,
  formatRegelwert,
  type Ausbildungsregeln,
  type EbmStaffel,
} from "../ausbildungsregeln/model";
import { ebmStaffelFuer, ebmStufeFuer, resolveRegelwerk, standardRegelwerk } from "../ausbildungsregeln/resolve";

const INSTANZ: Ausbildungsregeln = {
  behandlungsstundenZiel: 500,
  svEinheitenZiel: 125,
  verhaeltnisWarnung: 3.5,
  verhaeltnisKritisch: 4.5,
  gruppeDoppelstundenZiel: 50,
  gruppeAmbulanzzeitZiel: 30,
};
const stufen = (werte: [number, number, number][]) => werte.map(([kinderzahl, total, share]) => ({ kinderzahl, total, share }));
const ALT: EbmStaffel = { id: "a", gueltigAb: "2025-01-01", stufen: stufen([[3, 100, 50], [4, 120, 60]]) };
const NEU: EbmStaffel = { id: "b", gueltigAb: "2026-01-01", stufen: stufen([[3, 110, 55], [4, 130, 65], [5, 150, 75]]) };

describe("Standardwerte", () => {
  it("sind die bisherigen festen Werte", () => {
    expect(DEFAULT_AUSBILDUNGSREGELN).toEqual({
      behandlungsstundenZiel: 600,
      svEinheitenZiel: 150,
      verhaeltnisWarnung: 4,
      verhaeltnisKritisch: 5,
      gruppeDoppelstundenZiel: 60,
      gruppeAmbulanzzeitZiel: 40,
    });
    expect(DEFAULT_EBM_STAFFELN).toEqual([
      {
        id: null,
        gueltigAb: "2000-01-01",
        stufen: stufen([[3, 177, 88.5], [4, 200, 100], [5, 225, 112.5], [6, 243, 121.5], [7, 266, 133], [8, 288, 144], [9, 301.5, 150.75]]),
      },
    ]);
  });

  it("jedes Feld gehört zu genau einer Gruppe", () => {
    expect(REGEL_GRUPPEN.flatMap((g) => g.felder).sort()).toEqual([...REGEL_FELDER].sort());
  });

  it("formatiert Verhältnisse als 1 : x, Ziele als Zahl", () => {
    expect(formatRegelwert("verhaeltnisWarnung", 3.5)).toBe("1 : 3,5");
    expect(formatRegelwert("verhaeltnisKritisch", 5)).toBe("1 : 5");
    expect(formatRegelwert("behandlungsstundenZiel", 600)).toBe("600");
  });
});

describe("resolveRegelwerk", () => {
  it("nimmt ohne Instanzprofil und ohne Abweichungen die Standardwerte", () => {
    const r = standardRegelwerk();
    expect(r.regeln).toEqual(DEFAULT_AUSBILDUNGSREGELN);
    expect(r.basis).toEqual(DEFAULT_AUSBILDUNGSREGELN);
    expect(r.basisQuelle).toBe("standard");
    expect(r.abweichungen).toEqual(KEINE_ABWEICHUNGEN);
    expect(r.abweichend).toEqual([]);
    expect(r.ebmStaffeln).toEqual(DEFAULT_EBM_STAFFELN);
  });

  it("übernimmt das Instanzprofil", () => {
    const r = resolveRegelwerk({ instanz: INSTANZ, abweichungen: null, ebmStaffeln: [] });
    expect(r.regeln).toEqual(INSTANZ);
    expect(r.basis).toEqual(INSTANZ);
    expect(r.basisQuelle).toBe("instanz");
  });

  it("überschreibt einzelne Felder persönlich, NULL erbt", () => {
    const r = resolveRegelwerk({
      instanz: INSTANZ,
      abweichungen: { ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 },
      ebmStaffeln: [],
    });
    expect(r.regeln).toEqual({ ...INSTANZ, behandlungsstundenZiel: 450 });
    expect(r.basis).toEqual(INSTANZ);
    expect(r.abweichend).toEqual(["behandlungsstundenZiel"]);
  });

  it("überschreibt Verhältnis und Gruppenziele nur paarweise; ein halbes Paar wird ignoriert", () => {
    const r = resolveRegelwerk({
      instanz: INSTANZ,
      abweichungen: {
        ...KEINE_ABWEICHUNGEN,
        verhaeltnisWarnung: 3,
        verhaeltnisKritisch: null,
        gruppeDoppelstundenZiel: 70,
        gruppeAmbulanzzeitZiel: 45,
      },
      ebmStaffeln: [],
    });
    expect(r.regeln.verhaeltnisWarnung).toBe(3.5);
    expect(r.regeln.verhaeltnisKritisch).toBe(4.5);
    expect(r.regeln.gruppeDoppelstundenZiel).toBe(70);
    expect(r.regeln.gruppeAmbulanzzeitZiel).toBe(45);
    expect(r.abweichungen.verhaeltnisWarnung).toBeNull();
    expect(r.abweichend).toEqual(["gruppeDoppelstundenZiel", "gruppeAmbulanzzeitZiel"]);
  });

  it("verändert weder Eingaben noch Standardwerte", () => {
    const instanz = { ...INSTANZ };
    const r = resolveRegelwerk({ instanz, abweichungen: null, ebmStaffeln: [NEU, ALT] });
    r.regeln.behandlungsstundenZiel = 1;
    r.basis.svEinheitenZiel = 1;
    r.ebmStaffeln[0].stufen.push({ kinderzahl: 99, total: 1, share: 1 });
    expect(instanz).toEqual(INSTANZ);
    expect(ALT.stufen).toHaveLength(2);
    expect(standardRegelwerk().regeln.behandlungsstundenZiel).toBe(600);
  });

  it("sortiert Staffeln nach Gültigkeitsbeginn und Stufen nach Kinderzahl", () => {
    const durcheinander: EbmStaffel = { id: "c", gueltigAb: "2024-01-01", stufen: stufen([[4, 2, 1], [3, 1, 0.5]]) };
    const r = resolveRegelwerk({ instanz: null, abweichungen: null, ebmStaffeln: [NEU, durcheinander, ALT] });
    expect(r.ebmStaffeln.map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(r.ebmStaffeln[0].stufen.map((s) => s.kinderzahl)).toEqual([3, 4]);
  });
});

describe("ebmStaffelFuer (Datum der Doppelstunde)", () => {
  it("wählt die Staffel mit dem spätesten Beginn bis zum Datum", () => {
    expect(ebmStaffelFuer("2026-01-01", [ALT, NEU]).id).toBe("b");
    expect(ebmStaffelFuer("2025-12-31", [ALT, NEU]).id).toBe("a");
    expect(ebmStaffelFuer("2026-07-01", [NEU, ALT]).id).toBe("b");
  });

  it("wendet die älteste Staffel auch vor ihrem Beginn an", () => {
    expect(ebmStaffelFuer("2020-01-01", [NEU, ALT]).id).toBe("a");
  });
});

describe("ebmStufeFuer", () => {
  it("kein Honorar unter der kleinsten Kinderzahl, darüber die größte Stufe", () => {
    const staffel = DEFAULT_EBM_STAFFELN[0];
    expect(ebmStufeFuer(2, staffel)).toBeNull();
    expect(ebmStufeFuer(3, staffel)).toEqual({ total: 177, share: 88.5 });
    expect(ebmStufeFuer(9, staffel)).toEqual({ total: 301.5, share: 150.75 });
    expect(ebmStufeFuer(12, staffel)).toEqual({ total: 301.5, share: 150.75 });
    expect(ebmStufeFuer(5, NEU)).toEqual({ total: 150, share: 75 });
    expect(ebmStufeFuer(7, NEU)).toEqual({ total: 150, share: 75 });
    expect(ebmStufeFuer(3, { id: null, gueltigAb: "2000-01-01", stufen: [] })).toBeNull();
  });
});
