import { describe, it, expect } from "vitest";
import { newPatientId, newTherapySessionId } from "@/types";
import type { Patient, SessionCategory, TherapySession } from "@/types";
import { gespraechsziffernKontingent, probatorikKontingent, sprechstundenKontingent } from "../kontingente";

const P = newPatientId("p-1");
const patient: Patient = {
  id: P, chiffre: "A-1", therapyType: "langzeittherapie", startDate: "2026-01-01", endDate: null, isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", antragsdatum: null, beantragteStunden: null, genehmigungsdatum: null, sprechstundenAmbulanz: 0,
};
let n = 0;
const s = (category: SessionCategory, date: string, durationMinutes: number, patientId = P): TherapySession => ({
  id: newTherapySessionId(`t-${++n}`), patientId, date, durationMinutes, notes: "", category,
});

describe("Kontingente je Fall (#66)", () => {
  it("Sprechstunde: Termine à 25 Min, abzüglich Ambulanzleitung, nur dieser Fall", () => {
    const sessions = [s("sprechstunde", "2026-01-05", 50), s("sprechstunde", "2026-01-12", 25), s("sprechstunde", "2026-01-12", 50, newPatientId("p-2"))];
    expect(sprechstundenKontingent(patient, sessions)).toEqual({ genutzt: 3, verfuegbar: 10 });
    expect(sprechstundenKontingent({ ...patient, sprechstundenAmbulanz: 2 }, sessions)).toEqual({ genutzt: 3, verfuegbar: 8 });
  });

  it("Probatorik: Sitzungen à 50 Min, andere Kategorien zählen nicht", () => {
    const sessions = [s("probatorik", "2026-01-19", 50), s("probatorik", "2026-01-26", 100), s("behandlung", "2026-02-02", 50)];
    expect(probatorikKontingent(patient, sessions)).toEqual({ genutzt: 3, verfuegbar: 6 });
  });

  it("Gesprächsziffern: à 10 Min, nur im Quartal des Stichtags", () => {
    const sessions = [s("gespraechsziffer", "2026-03-31", 30), s("gespraechsziffer", "2026-04-01", 20), s("gespraechsziffer", "2026-06-30", 50)];
    expect(gespraechsziffernKontingent(patient, sessions, "2026-05-15")).toEqual({ genutzt: 7, verfuegbar: 15 });
    expect(gespraechsziffernKontingent(patient, sessions, "2026-02-01")).toEqual({ genutzt: 3, verfuegbar: 15 });
  });
});
