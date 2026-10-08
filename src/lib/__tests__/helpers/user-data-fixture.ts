import type { UserData } from "../../db/user-data";
import {
  newGroupId,
  newGroupSessionId,
  newPatientId,
  newSupervisionSessionId,
  newSupervisorId,
  newTherapySessionId,
} from "@/types";

// Feste Beispieldaten für reine Tests (Nachweis, CSV, Datenexport). Drei Sitzungen liegen im
// 1. Quartal 2026 (t-1, t-2, t-3), eine im April (t-4). sv-1 (Supervision Eins) bespricht t-1 und t-2,
// sv-2 (Supervision Zwei) bespricht t-3, sv-3 (Supervision Eins, April) bespricht die Doppelstunde gs-1
// vom Januar. Keine echten Daten – Chiffren A-01/A-02, Adressen unter example.com.
export function sampleUserData(): UserData {
  return {
    account: { id: "u-a", email: "a@example.com", name: "PiA A", role: "pia", createdAt: "2026-01-01T08:00:00.000Z" },
    patients: [
      {
        id: newPatientId("p-1"),
        chiffre: "A-01",
        therapyType: "kurzzeittherapie",
        startDate: "2026-01-05",
        endDate: null,
        isActive: true,
        createdAt: "2026-01-05T08:00:00.000Z",
        antragsdatum: null,
        beantragteStunden: null,
        genehmigungsdatum: null,
        sprechstundenAmbulanz: 0,
      },
      {
        id: newPatientId("p-2"),
        chiffre: "A-02",
        therapyType: "langzeittherapie",
        startDate: "2026-02-01",
        endDate: null,
        isActive: true,
        createdAt: "2026-02-01T08:00:00.000Z",
        antragsdatum: "2026-02-10",
        beantragteStunden: 60,
        genehmigungsdatum: null,
        sprechstundenAmbulanz: 0,
      },
    ],
    supervisors: [
      { id: newSupervisorId("s-1"), name: "Supervision Eins", costPerHour: 80, isActive: true },
      { id: newSupervisorId("s-2"), name: "Supervision Zwei", costPerHour: null, isActive: true },
    ],
    therapySessions: [
      { id: newTherapySessionId("t-1"), patientId: newPatientId("p-1"), date: "2026-01-10", durationMinutes: 50, notes: "Erstgespräch", category: "probatorik" },
      { id: newTherapySessionId("t-2"), patientId: newPatientId("p-2"), date: "2026-02-14", durationMinutes: 60, notes: "", category: "behandlung" },
      { id: newTherapySessionId("t-3"), patientId: newPatientId("p-1"), date: "2026-03-31", durationMinutes: 50, notes: "=SUMME(A1)", category: "bezugsperson" },
      { id: newTherapySessionId("t-4"), patientId: newPatientId("p-2"), date: "2026-04-01", durationMinutes: 50, notes: "", category: "behandlung" },
    ],
    supervisionSessions: [
      {
        id: newSupervisionSessionId("sv-1"),
        supervisorId: newSupervisorId("s-1"),
        date: "2026-02-20",
        durationMinutes: 60,
        kind: "individual",
        setting: "einzel",
        linkedTherapySessionIds: [newTherapySessionId("t-2"), newTherapySessionId("t-1")],
        linkedGroupSessionIds: [],
        caseShares: [
          { patientId: newPatientId("p-1"), minutes: 30 },
          { patientId: newPatientId("p-2"), minutes: 30 },
        ],
      },
      {
        id: newSupervisionSessionId("sv-2"),
        supervisorId: newSupervisorId("s-2"),
        date: "2026-03-15",
        durationMinutes: 90,
        kind: "individual",
        setting: "gruppe",
        linkedTherapySessionIds: [newTherapySessionId("t-3")],
        linkedGroupSessionIds: [],
        caseShares: [{ patientId: newPatientId("p-1"), minutes: 90 }],
      },
      {
        id: newSupervisionSessionId("sv-3"),
        supervisorId: newSupervisorId("s-1"),
        date: "2026-04-05",
        durationMinutes: 60,
        kind: "group",
        setting: "einzel",
        linkedTherapySessionIds: [],
        linkedGroupSessionIds: [newGroupSessionId("gs-1")],
        caseShares: [],
      },
    ],
    groups: [
      { id: newGroupId("g-1"), name: "Gruppe Montag", startDate: "2026-01-05", plannedSessionCount: 20, avgKids: 5, isActive: true, createdAt: "2026-01-05T08:00:00.000Z" },
    ],
    groupSessions: [
      { id: newGroupSessionId("gs-1"), groupId: newGroupId("g-1"), date: "2026-01-12", status: "durchgefuehrt", childCount: 6, countsTowardAmbulanzzeit: true, durationMinutes: 100, notes: "" },
      { id: newGroupSessionId("gs-2"), groupId: newGroupId("g-1"), date: "2026-01-19", status: "ausgefallen", childCount: null, countsTowardAmbulanzzeit: true, durationMinutes: 100, notes: "Krankheit" },
      { id: newGroupSessionId("gs-3"), groupId: newGroupId("g-1"), date: "2026-04-06", status: "durchgefuehrt", childCount: 5, countsTowardAmbulanzzeit: false, durationMinutes: 100, notes: "" },
    ],
    financialSettings: { incomePerHour: 40, plannedSessionsPerWeek: null },
  };
}
