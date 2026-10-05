import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  newPatientId,
  newSupervisionSessionId,
  newSupervisorId,
  newTherapySessionId,
  type Patient,
  type SupervisionSession,
  type TherapySession,
} from "@/types";

const data = vi.hoisted(() => ({
  patients: [] as unknown[],
  therapySessions: [] as unknown[],
  supervisionSessions: [] as unknown[],
}));
vi.mock("@/lib/db/index", () => ({
  getPatients: async () => data.patients,
  getTherapySessions: async () => data.therapySessions,
  getSupervisionSessions: async () => data.supervisionSessions,
  getGroupSessions: async () => [],
  getFinancialSettings: async () => ({ incomePerHour: 85, supervisionCosts: {}, plannedSessionsPerWeek: null }),
}));
vi.mock("@/lib/db/regelwerk", async () => {
  const { standardRegelwerk } = await import("@/lib/ausbildungsregeln/resolve");
  return { getCurrentRegelwerk: async () => standardRegelwerk() };
});

import { loadDashboard } from "../(app)/load-dashboard";
import { calculatePatientRatio } from "@/lib/calculations";
import { standardRegelwerk } from "@/lib/ausbildungsregeln/resolve";

const P1 = newPatientId("550e8400-e29b-41d4-a716-446655440001");
const patient = (id: Patient["id"], chiffre: string, isActive: boolean): Patient => ({
  id,
  chiffre,
  therapyType: "langzeittherapie",
  startDate: "2026-01-05",
  endDate: null,
  isActive,
  createdAt: "2026-01-05T08:00:00.000Z",
  antragsdatum: null,
  beantragteStunden: null,
  genehmigungsdatum: null,
  sprechstundenAmbulanz: 0,
});
const therapy: TherapySession = { id: newTherapySessionId("t-1"), patientId: P1, date: "2026-09-21", durationMinutes: 50, notes: "", category: "behandlung" };
const supervision: SupervisionSession = {
  id: newSupervisionSessionId("sv-1"),
  supervisorId: newSupervisorId("s-1"),
  date: "2026-03-02",
  durationMinutes: 50,
  kind: "individual",
  setting: "einzel",
  linkedTherapySessionIds: [therapy.id],
  linkedGroupSessionIds: [],
};

describe("loadDashboard", () => {
  beforeEach(() => {
    data.patients = [patient(P1, "A-1", true), patient(newPatientId("550e8400-e29b-41d4-a716-446655440002"), "A-2", false)];
    data.therapySessions = [therapy];
    data.supervisionSessions = [supervision];
  });

  it("liefert Datumsangaben und Verhältnisse fertig formatiert bzw. berechnet – im try der Seite, nicht im JSX", async () => {
    const d = await loadDashboard();
    expect(d.recentEntries.map((e) => [e.key, e.label, e.dateLabel])).toEqual([
      ["t-t-1", "A-1", "21. Sep. 2026"],
      ["s-sv-1", "Supervision", "02. März 2026"],
    ]);
    expect(d.patientRatios.map((r) => r.patient.chiffre)).toEqual(["A-1"]);
    expect(d.patientRatios[0].ratio).toEqual(calculatePatientRatio(data.patients[0] as Patient, [therapy], [supervision], standardRegelwerk().regeln));
    expect(d.patientRatios[0].due).toBe(false);
    expect(d.supervisionBySetting).toEqual({ einzel: 1, gruppe: 0 });
  });

  it("markiert eine Patient:in mit fünf Sitzungen ohne Supervision als „SV fällig“", async () => {
    data.therapySessions = ["o-1", "o-2", "o-3", "o-4", "o-5"].map((id, i) => ({ ...therapy, id: newTherapySessionId(id), date: `2026-09-0${i + 1}` }));
    data.supervisionSessions = [];
    const d = await loadDashboard();
    expect(d.patientRatios[0].due).toBe(true);
  });

  it("lässt einen Formatierungsfehler aus loadDashboard heraus fallen – die Seite fängt ihn im try", async () => {
    data.therapySessions = [{ ...therapy, date: "kaputt" }];
    await expect(loadDashboard()).rejects.toThrow(RangeError);
  });
});
