import { describe, it, expect } from "vitest";
import {
  mapPatientRow,
  mapSupervisorRow,
  mapTherapySessionRow,
  mapSupervisionSessionRow,
  PatientRow,
  SupervisorRow,
  TherapySessionRow,
  SupervisionSessionRow,
} from "../db-mappers";
import { TherapySessionId } from "@/types";

describe("mapPatientRow", () => {
  it("maps snake_case to camelCase", () => {
    const row: PatientRow = {
      id: "p-1",
      chiffre: "KL-2024-001",
      therapy_type: "langzeittherapie",
      start_date: "2024-01-01",
      end_date: null,
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
      antragsdatum: null,
      beantragte_stunden: null,
      genehmigungsdatum: null,
      sprechstunden_ambulanz: 0,
    };

    const patient = mapPatientRow(row);

    expect(patient.id).toBe("p-1");
    expect(patient.chiffre).toBe("KL-2024-001");
    expect(patient.therapyType).toBe("langzeittherapie");
    expect(patient.startDate).toBe("2024-01-01");
    expect(patient.endDate).toBeNull();
    expect(patient.isActive).toBe(true);
    expect(patient.createdAt).toBe("2024-01-01T00:00:00Z");
    expect(patient.antragsdatum).toBeNull();
    expect(patient.beantragteStunden).toBeNull();
    expect(patient.genehmigungsdatum).toBeNull();
    expect(patient.sprechstundenAmbulanz).toBe(0);
  });

  it("handles end_date with value", () => {
    const row: PatientRow = {
      id: "p-2",
      chiffre: "KL-2024-002",
      therapy_type: "kurzzeittherapie",
      start_date: "2024-01-01",
      end_date: "2024-06-01",
      is_active: false,
      created_at: "2024-01-01T00:00:00Z",
      antragsdatum: "2024-03-01",
      beantragte_stunden: 60,
      genehmigungsdatum: "2024-04-15",
      sprechstunden_ambulanz: 3,
    };

    const patient = mapPatientRow(row);
    expect(patient.endDate).toBe("2024-06-01");
    expect(patient.isActive).toBe(false);
    expect(patient.antragsdatum).toBe("2024-03-01");
    expect(patient.beantragteStunden).toBe(60);
    expect(patient.genehmigungsdatum).toBe("2024-04-15");
    expect(patient.sprechstundenAmbulanz).toBe(3);
  });
});

describe("mapSupervisorRow", () => {
  it("maps snake_case to camelCase", () => {
    const row: SupervisorRow = {
      id: "sup-1",
      name: "Dr. Schmidt",
      cost_per_hour: 80,
      is_active: true,
    };

    const supervisor = mapSupervisorRow(row);

    expect(supervisor.id).toBe("sup-1");
    expect(supervisor.name).toBe("Dr. Schmidt");
    expect(supervisor.costPerHour).toBe(80);
    expect(supervisor.isActive).toBe(true);
  });

  it("handles null cost_per_hour", () => {
    const row: SupervisorRow = {
      id: "sup-2",
      name: "Prof. Müller",
      cost_per_hour: null,
      is_active: true,
    };

    const supervisor = mapSupervisorRow(row);
    expect(supervisor.costPerHour).toBeNull();
  });
});

describe("mapTherapySessionRow", () => {
  it("maps snake_case to camelCase", () => {
    const row: TherapySessionRow = {
      id: "ts-1",
      patient_id: "p-1",
      date: "2024-06-01",
      duration_minutes: 50,
      notes: "Some notes",
      category: "probatorik",
    };

    const session = mapTherapySessionRow(row);

    expect(session.id).toBe("ts-1");
    expect(session.patientId).toBe("p-1");
    expect(session.date).toBe("2024-06-01");
    expect(session.durationMinutes).toBe(50);
    expect(session.notes).toBe("Some notes");
    expect(session.category).toBe("probatorik");
  });
});

describe("mapSupervisionSessionRow", () => {
  it("maps snake_case to camelCase with linked IDs", () => {
    const row: SupervisionSessionRow = {
      id: "sv-1",
      supervisor_id: "sup-1",
      date: "2024-06-01",
      duration_minutes: 60,
      kind: "individual",
    };

    const linkedIds = ["ts-1", "ts-2"] as TherapySessionId[];
    const session = mapSupervisionSessionRow(row, linkedIds);

    expect(session.id).toBe("sv-1");
    expect(session.supervisorId).toBe("sup-1");
    expect(session.date).toBe("2024-06-01");
    expect(session.durationMinutes).toBe(60);
    expect(session.kind).toBe("individual");
    expect(session.linkedTherapySessionIds).toEqual(["ts-1", "ts-2"]);
    expect(session.linkedGroupSessionIds).toEqual([]);
  });

  it("handles empty linked IDs", () => {
    const row: SupervisionSessionRow = {
      id: "sv-2",
      supervisor_id: "sup-1",
      date: "2024-06-02",
      duration_minutes: 45,
      kind: "group",
    };

    const session = mapSupervisionSessionRow(row, []);
    expect(session.linkedTherapySessionIds).toEqual([]);
    expect(session.kind).toBe("group");
  });
});
