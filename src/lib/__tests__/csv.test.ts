// @vitest-environment node
import { describe, it, expect } from "vitest";
import { csvCell, csvLine, toCsv, formatDecimal, formatHours, CSV_BOM } from "../csv";

describe("csvCell", () => {
  it("lässt einfache Werte unverändert", () => {
    expect(csvCell("A-01")).toBe("A-01");
    expect(csvCell("2026-01-02")).toBe("2026-01-02");
    expect(csvCell("Supervision Eins")).toBe("Supervision Eins");
  });

  it("setzt Werte mit Semikolon, Anführungszeichen, Zeilenumbruch oder Randleerzeichen in Anführungszeichen", () => {
    expect(csvCell("Thema; Fortsetzung")).toBe('"Thema; Fortsetzung"');
    expect(csvCell('Zitat "so"')).toBe('"Zitat ""so"""');
    expect(csvCell("Zeile 1\nZeile 2")).toBe('"Zeile 1\nZeile 2"');
    expect(csvCell(" führendes Leerzeichen")).toBe('" führendes Leerzeichen"');
  });

  it.each(["=SUMME(A1)", "+49 170", "-5 Punkte", "@name", "\tTab"])("entschärft den Formel-Präfix in %j", (raw) => {
    expect(csvCell(raw)).toBe(`'${raw}`);
  });

  it("formatiert Zahlen mit Dezimalkomma, Booleans als ja/nein, null und undefined als leer", () => {
    expect(csvCell(50)).toBe("50");
    expect(csvCell(88.5)).toBe("88,50");
    expect(csvCell(true)).toBe("ja");
    expect(csvCell(false)).toBe("nein");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("formatHours / formatDecimal", () => {
  it("rechnet Minuten in Stunden mit zwei Nachkommastellen und Dezimalkomma um", () => {
    expect(formatHours(50)).toBe("0,83");
    expect(formatHours(90)).toBe("1,50");
    expect(formatHours(0)).toBe("0,00");
    expect(formatDecimal(40)).toBe("40,00");
    expect(formatDecimal(2.6667, 1)).toBe("2,7");
  });
});

describe("toCsv", () => {
  it("beginnt mit BOM, trennt mit Semikolon und beendet jede Zeile mit CRLF", () => {
    const csv = toCsv(["Datum", "Chiffre"], [["2026-01-02", "A-01"], ["2026-01-03", "B; 2"]]);
    expect(csv).toBe(`${CSV_BOM}Datum;Chiffre\r\n2026-01-02;A-01\r\n2026-01-03;"B; 2"\r\n`);
    expect(csvLine(["a", 1, null])).toBe("a;1;");
  });
});
