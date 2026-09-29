// @vitest-environment node
import { describe, it, expect } from "vitest";
import { countNoun, formatCents, formatEuro, formatVerhaeltnis, formatZahlDe, parseZahlDe } from "../format";

describe("formatEuro", () => {
  it("rundet auf ganze Euro mit deutschem Tausenderpunkt und „EUR“", () => {
    expect(formatEuro(1234.4)).toBe("1.234 EUR");
    expect(formatEuro(1234.56)).toBe("1.235 EUR");
    expect(formatEuro(0)).toBe("0 EUR");
    expect(formatEuro(-266.4)).toBe("-266 EUR");
    expect(formatEuro(-0.4)).toBe("0 EUR");
  });
});

describe("formatCents", () => {
  it("schreibt genau zwei Nachkommastellen mit deutschem Tausenderpunkt, ohne Einheit", () => {
    expect(formatCents(85)).toBe("85,00");
    expect(formatCents(1234.56)).toBe("1.234,56");
    expect(formatCents(-0)).toBe("0,00");
  });
});

describe("countNoun", () => {
  it("setzt Singular und Plural – kein „1 Sitzungen“, kein „Sitzung(en)“", () => {
    expect(countNoun(1, "Sitzung", "Sitzungen")).toBe("1 Sitzung");
    expect(countNoun(0, "Sitzung", "Sitzungen")).toBe("0 Sitzungen");
    expect(countNoun(2, "Zuordnung", "Zuordnungen")).toBe("2 Zuordnungen");
  });

  it("schreibt Zahlen deutsch und setzt den Singular nur bei genau ±1", () => {
    expect(countNoun(1.5, "Sitzung", "Sitzungen")).toBe("1,5 Sitzungen");
    expect(countNoun(0.5, "Sitzung", "Sitzungen")).toBe("0,5 Sitzungen");
    expect(countNoun(-1, "Sitzung", "Sitzungen")).toBe("-1 Sitzung");
    expect(countNoun(-2, "Sitzung", "Sitzungen")).toBe("-2 Sitzungen");
    expect(countNoun(1000, "Sitzung", "Sitzungen")).toBe("1.000 Sitzungen");
  });
});

describe("formatVerhaeltnis", () => {
  it("zeigt ganze Zahlen ohne Komma und sonst eine Nachkommastelle", () => {
    expect(formatVerhaeltnis(4)).toBe("4");
    expect(formatVerhaeltnis(10)).toBe("10");
    expect(formatVerhaeltnis(3.5)).toBe("3,5");
  });
});

describe("parseZahlDe", () => {
  it("liest deutsche Schreibweise: Komma als Dezimaltrenner, Punkte nur als Tausendertrenner", () => {
    expect(parseZahlDe("450")).toBe(450);
    expect(parseZahlDe("3,5")).toBe(3.5);
    expect(parseZahlDe("1.000")).toBe(1000);
    expect(parseZahlDe("1.000,50")).toBe(1000.5);
    expect(parseZahlDe("12.345.678")).toBe(12345678);
    expect(parseZahlDe(" 99,5 ")).toBe(99.5);
    expect(parseZahlDe("-2")).toBe(-2);
  });

  it("macht aus allem Mehrdeutigen NaN, statt still falsch zu lesen (Server meldet „Bitte eine Zahl eingeben“)", () => {
    for (const text of ["", "  ", "200.5", "1.00", "1,000.5", "3,", ",5", "abc", "1 000"]) {
      expect(parseZahlDe(text), text).toBeNaN();
    }
  });
});

describe("formatZahlDe", () => {
  it("schreibt Zahlen für Eingabefelder mit Komma und ohne Tausenderpunkt – parseZahlDe liest sie zurück", () => {
    expect(formatZahlDe(3.5)).toBe("3,5");
    expect(formatZahlDe(1000)).toBe("1000");
    expect(formatZahlDe(150.75)).toBe("150,75");
    for (const wert of [4, 3.5, 1000, 1000.5, 150.75]) expect(parseZahlDe(formatZahlDe(wert))).toBe(wert);
  });
});
