import { describe, it, expect } from "vitest";
import { anamneseKontingent, ausgeschoepft, explorationKontingent, kontingenteJeKategorie } from "../kontingente";
import { bezahlteMinuten } from "../calculations";
import { newPatientId, newTherapySessionId, type Patient, type SessionCategory, type TherapySession } from "@/types";

const patient: Patient = {
  id: newPatientId("p-1"), chiffre: "A", therapyType: "kurzzeittherapie", startDate: "2026-01-01", endDate: null, isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", antragsdatum: null, beantragteStunden: null, beantragteBezugspersonStunden: null,
  genehmigungsdatum: null, sprechstundenAmbulanz: 0,
};
let n = 0;
const s = (date: string, category: SessionCategory, durationMinutes: number, patientId = "p-1"): TherapySession => ({
  id: newTherapySessionId(`t-${++n}`), patientId: newPatientId(patientId), date, durationMinutes, notes: "", category,
});

describe("Kontingente Anamnese und Vertiefte Exploration", () => {
  it("Anamnese: eine Sitzung à 50 Min je Fall", () => {
    expect(anamneseKontingent(patient, [])).toEqual({ genutzt: 0, verfuegbar: 1 });
    const k = anamneseKontingent(patient, [s("2026-02-01", "anamnese", 50), s("2026-02-01", "anamnese", 50, "p-2")]);
    expect(k).toEqual({ genutzt: 1, verfuegbar: 1 });
    expect(ausgeschoepft(k)).toBe(true);
  });

  it("Vertiefte Exploration: zwei Ziffern à 20 Min je Quartal des Stichtags", () => {
    const sessions = [s("2026-03-30", "exploration", 20), s("2026-04-02", "exploration", 20), s("2026-05-10", "exploration", 20)];
    expect(explorationKontingent(patient, sessions, "2026-03-31")).toEqual({ genutzt: 1, verfuegbar: 2 });
    const q2 = explorationKontingent(patient, sessions, "2026-05-15");
    expect(q2).toEqual({ genutzt: 2, verfuegbar: 2 });
    expect(ausgeschoepft(q2)).toBe(true);
  });

  it("liefert alle Fall-Kontingente je Kategorie für das Erfassen", () => {
    const k = kontingenteJeKategorie(patient, [s("2026-02-01", "probatorik", 50)], "2026-02-10");
    expect(Object.keys(k)).toEqual(["sprechstunde", "probatorik", "anamnese", "gespraechsziffer", "exploration"]);
    expect(k.probatorik).toEqual({ genutzt: 1, verfuegbar: 6 });
    expect(ausgeschoepft(k.probatorik!)).toBe(false);
  });
});

describe("bezahlteMinuten", () => {
  it("SV-Gruppe: angerechnet die ganze Dauer, bezahlt nur der eigene Anteil", () => {
    expect(bezahlteMinuten({ durationMinutes: 50, gruppengroesse: 2 })).toBe(25);
    expect(bezahlteMinuten({ durationMinutes: 75, gruppengroesse: 3 })).toBe(25);
    expect(bezahlteMinuten({ durationMinutes: 50, gruppengroesse: null })).toBe(50);
    expect(bezahlteMinuten({ durationMinutes: 50 })).toBe(50);
  });
});
