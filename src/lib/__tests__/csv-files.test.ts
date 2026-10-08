// @vitest-environment node
import { describe, it, expect } from "vitest";
import { CSV_BOM } from "../csv";
import {
  therapySessionsCsv,
  supervisionsCsv,
  groupSessionsCsv,
  patientsCsv,
  expensesCsv,
  CSV_EXPORTS,
  isCsvExportKey,
  parseExportYear,
} from "../export/csv-files";
import { sampleUserData } from "./helpers/user-data-fixture";
import { financeTotals } from "../calculations";

const lines = (csv: string) => csv.split("\r\n");

describe("CSV-Dateien", () => {
  it("Therapiesitzungen: Kopfzeile, Chiffre, Kategorie, Stunden mit Dezimalkomma und die Supervision", () => {
    const l = lines(therapySessionsCsv(sampleUserData()));
    expect(l[0]).toBe(`${CSV_BOM}Datum;Chiffre;Kategorie;Dauer (Minuten);Dauer (Stunden);Notiz;Supervision am;Supervisor:in`);
    expect(l[1]).toBe("2026-01-10;A-01;Probatorik;50;0,83;Erstgespräch;2026-02-20;Supervision Eins");
    expect(l[2]).toBe("2026-02-14;A-02;Behandlung;60;1,00;;2026-02-20;Supervision Eins");
    expect(l[4]).toBe("2026-04-01;A-02;Behandlung;50;0,83;;;");
    expect(l.at(-1)).toBe("");
  });

  it("entschärft Formeln in Notizen", () => {
    const l = lines(therapySessionsCsv(sampleUserData()));
    expect(l[3]).toBe("2026-03-31;A-01;Bezugsperson;50;0,83;'=SUMME(A1);2026-03-15;Supervision Zwei");
  });

  it("Supervisionen: Art, Setting und besprochene Sitzungen/Doppelstunden nach Datum", () => {
    const l = lines(supervisionsCsv(sampleUserData()));
    expect(l[0]).toBe(
      `${CSV_BOM}Datum;Supervisor:in;Art;Setting;Dauer (Minuten);Dauer (Stunden);Besprochene Sitzungen;Besprochene Doppelstunden;Dauer je Patient:in`
    );
    expect(l[1]).toBe("2026-02-20;Supervision Eins;Einzeltherapie;Einzel;60;1,00;A-01 (2026-01-10), A-02 (2026-02-14);;A-01: 30 Min, A-02: 30 Min");
    expect(l[2]).toBe("2026-03-15;Supervision Zwei;Einzeltherapie;Gruppe;90;1,50;A-01 (2026-03-31);;A-01: 90 Min");
    expect(l[3]).toBe("2026-04-05;Supervision Eins;Gruppentherapie;Einzel;60;1,00;;Gruppe Montag (2026-01-12);");
  });

  it("Supervisionen: besprochene Sitzungen gleichen Datums natürlich nach Chiffre", () => {
    const data = sampleUserData();
    data.patients[0].chiffre = "A-10";
    data.patients[1].chiffre = "A-2";
    data.therapySessions[1].date = "2026-01-10";
    expect(lines(supervisionsCsv(data))[1]).toBe("2026-02-20;Supervision Eins;Einzeltherapie;Einzel;60;1,00;A-2 (2026-01-10), A-10 (2026-01-10);;A-2: 30 Min, A-10: 30 Min");
  });

  it("Doppelstunden: Status auf Deutsch, Teilnehmende, ja/nein, Notiz und Supervision", () => {
    const l = lines(groupSessionsCsv(sampleUserData()));
    expect(l[0]).toBe(
      `${CSV_BOM}Datum;Gruppe;Status;Teilnehmende;Zählt zur Ambulanzzeit;Dauer (Minuten);Dauer (Stunden);Notiz;Supervision am;Supervisor:in`
    );
    expect(l[1]).toBe("2026-01-12;Gruppe Montag;durchgeführt;6;ja;100;1,67;;2026-04-05;Supervision Eins");
    expect(l[2]).toBe("2026-01-19;Gruppe Montag;ausgefallen;;ja;100;1,67;Krankheit;;");
  });

  it("Patient:innen: nur Chiffre und Stammdaten plus Sitzungssumme", () => {
    const l = lines(patientsCsv(sampleUserData()));
    expect(l[0]).toBe(
      `${CSV_BOM}Chiffre;Therapieart;Beginn;Ende;Aktiv;Antragsdatum;Genehmigungsdatum;Beantragte Behandlungsstunden;Sprechstunden durch Ambulanzleitung;Sitzungen (Anzahl);Sitzungen (Stunden)`
    );
    expect(l[1]).toBe("A-01;Kurzzeittherapie;2026-01-05;;ja;;;;0;2;1,67");
    expect(l[2]).toBe("A-02;Langzeittherapie;2026-02-01;;ja;2026-02-10;;60;0;2;1,83");
  });

  it("Patient:innen: Genehmigungsdatum und Sprechstunden der Ambulanzleitung (#66)", () => {
    const data = sampleUserData();
    data.patients[1].genehmigungsdatum = "2026-03-01";
    data.patients[1].sprechstundenAmbulanz = 2;
    expect(lines(patientsCsv(data))[2]).toBe("A-02;Langzeittherapie;2026-02-01;;ja;2026-02-10;2026-03-01;60;2;2;1,83");
  });

  it("Ausgaben: Kosten je Supervision wie auf der Finanzseite, ohne hinterlegte Kosten 0, Summenzeile (#65)", () => {
    const l = lines(expensesCsv(sampleUserData()));
    expect(l[0]).toBe(
      `${CSV_BOM}Datum;Quartal;Supervisor:in;Art;Setting;Dauer (Minuten);SV-Einheiten;Kosten je SV-Einheit (EUR);Betrag (EUR)`
    );
    expect(l[1]).toBe("2026-02-20;2026 Q1;Supervision Eins;Einzeltherapie;Einzel;60;1,20;80,00;96,00");
    expect(l[2]).toBe("2026-03-15;2026 Q1;Supervision Zwei;Einzeltherapie;Gruppe;90;1,80;0,00;0,00");
    expect(l[3]).toBe("2026-04-05;2026 Q2;Supervision Eins;Gruppentherapie;Einzel;60;1,20;80,00;96,00");
    expect(l[4]).toBe("Summe;;;;;;;;192,00");
    expect(l.at(-1)).toBe("");
  });

  it("Ausgaben: Summe wie die Kachel „Ausgaben“ auf der Finanzseite (financeTotals)", () => {
    const data = sampleUserData();
    const costs = Object.fromEntries(data.supervisors.map((s) => [s.id, s.costPerHour ?? 0]));
    const { totalCosts } = financeTotals(data.therapySessions, data.supervisionSessions, [], 0, costs, []);
    expect(lines(expensesCsv(data)).at(-2)).toBe(`Summe;;;;;;;;${totalCosts.toFixed(2).replace(".", ",")}`);
  });

  it("Ausgaben: Summenzeile addiert die auf Cent gerundeten Beträge", () => {
    const data = sampleUserData();
    data.supervisors[0].costPerHour = 33.33;
    data.supervisionSessions[0].durationMinutes = 25;
    data.supervisionSessions[2].durationMinutes = 25;
    const l = lines(expensesCsv(data));
    expect(l[1].endsWith(";0,50;33,33;16,67")).toBe(true);
    expect(l[3].endsWith(";0,50;33,33;16,67")).toBe(true);
    expect(l[4]).toBe("Summe;;;;;;;;33,34");
  });

  it("Ausgaben: mit Jahr nur Supervisionen dieses Kalenderjahrs", () => {
    const data = sampleUserData();
    data.supervisionSessions[0].date = "2025-12-31";
    const l = lines(expensesCsv(data, { year: 2026 }));
    expect(l.slice(1, -1).map((line) => line.split(";")[0])).toEqual(["2026-03-15", "2026-04-05", "Summe"]);
    expect(l.at(-2)).toBe("Summe;;;;;;;;96,00");
    expect(lines(expensesCsv(data, { year: 2024 })).slice(1, -1)).toEqual(["Summe;;;;;;;;0,00"]);
  });

  it("Jahr aus der Adresse: nur vier Ziffern", () => {
    expect(parseExportYear("2026")).toBe(2026);
    expect(parseExportYear("26")).toBeUndefined();
    expect(parseExportYear("2026-01")).toBeUndefined();
    expect(parseExportYear(" 2026")).toBeUndefined();
    expect(parseExportYear("")).toBeUndefined();
  });

  it("kennt genau fünf Exporte mit ASCII-Dateinamen und lehnt Prototyp-Namen ab", () => {
    expect(Object.keys(CSV_EXPORTS)).toEqual(["therapy-sessions", "supervisions", "group-sessions", "patients", "expenses"]);
    expect(Object.values(CSV_EXPORTS).map((e) => e.fileStem)).toEqual([
      "therapiesitzungen",
      "supervisionen",
      "doppelstunden",
      "patientinnen",
      "ausgaben",
    ]);
    expect(Object.entries(CSV_EXPORTS).filter(([, e]) => e.byYear).map(([key]) => key)).toEqual(["expenses"]);
    expect(isCsvExportKey("patients")).toBe(true);
    expect(isCsvExportKey("constructor")).toBe(false);
    expect(isCsvExportKey("users")).toBe(false);
  });
});
