import { describe, it, expect } from "vitest";
import {
  totalTherapyHours,
  totalSupervisionHours,
  calculateRatio,
  calculateOverallRatio,
  calculatePatientRatio,
  getUnsupervisedSessions,
  calculateQuarterlyFinances,
  calculateQuarterlyFinancesWithGroups,
  therapyHoursForPatient,
  supervisionHoursForPatient,
  remainingContingentForPatient,
  bezugspersonenStundenForPatient,
  roundUnits,
  getEbmFee,
  groupSessionCounts,
  ambulanzzeitRemaining,
  groupIncomeTotal,
  linkableTherapySessions,
  linkableGroupSessions,
  quarterOf,
  hoursRemaining,
  supervisionHoursMissingForRatio,
  minutesToUnits,
  financeTotals,
  sessionHoursByCategory,
  supervisionCases,
  supervisionDuePatientIds,
} from "../calculations";
import { resolveRegelwerk, standardRegelwerk } from "../ausbildungsregeln/resolve";
import type { Ausbildungsregeln } from "../ausbildungsregeln/model";
import { UNIT_MINUTES } from "../constants";
import {
  TherapySession,
  SupervisionSession,
  Patient,
  GroupSession,
  newPatientId,
  newSupervisorId,
  newTherapySessionId,
  newSupervisionSessionId,
  newGroupId,
  newGroupSessionId,
} from "@/types";

const R = standardRegelwerk().regeln;
const STRENG: Ausbildungsregeln = { ...R, verhaeltnisWarnung: 3, verhaeltnisKritisch: 3.5, gruppeAmbulanzzeitZiel: 30 };
const S = standardRegelwerk().ebmStaffeln;
const ZWEI_STAFFELN = resolveRegelwerk({
  instanz: null,
  abweichungen: null,
  ebmStaffeln: [
    { id: "alt", gueltigAb: "2000-01-01", stufen: [{ kinderzahl: 3, total: 100, share: 50 }, { kinderzahl: 4, total: 120, share: 60 }] },
    { id: "neu", gueltigAb: "2026-01-01", stufen: [{ kinderzahl: 3, total: 110, share: 55 }, { kinderzahl: 4, total: 130, share: 65 }] },
  ],
}).ebmStaffeln;

// ---- Test Data Factories ----
function makeTherapySession(overrides: Partial<TherapySession> = {}): TherapySession {
  return {
    id: newTherapySessionId("ts-1"),
    patientId: newPatientId("p-1"),
    date: "2024-06-01",
    durationMinutes: 60,
    notes: "",
    category: "behandlung",
    ...overrides,
  };
}

function makeSupervisionSession(
  overrides: Partial<SupervisionSession> = {}
): SupervisionSession {
  return {
    id: newSupervisionSessionId("sv-1"),
    supervisorId: newSupervisorId("sup-1"),
    date: "2024-06-01",
    durationMinutes: 60,
    kind: "individual",
    linkedTherapySessionIds: [],
    linkedGroupSessionIds: [],
    ...overrides,
  };
}

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: newPatientId("p-1"),
    chiffre: "TEST-001",
    therapyType: "langzeittherapie",
    startDate: "2024-01-01",
    endDate: null,
    isActive: true,
    createdAt: "2024-01-01T00:00:00Z",
    antragsdatum: null,
    beantragteStunden: null,
    genehmigungsdatum: null,
    sprechstundenAmbulanz: 0,
    ...overrides,
  };
}

function makeGroupSession(overrides: Partial<GroupSession> = {}): GroupSession {
  return {
    id: newGroupSessionId("gs-1"),
    groupId: newGroupId("g-1"),
    date: "2024-06-01",
    status: "durchgefuehrt",
    childCount: 9,
    countsTowardAmbulanzzeit: true,
    durationMinutes: 100,
    notes: "",
    ...overrides,
  };
}

// ---- Tests ----
describe("Ausbildungseinheiten à 50 Minuten", () => {
  it("rechnet Minuten in Einheiten um: 50 Min = 1, 60 Min = 1,2, Doppelstunde 100 Min = 2", () => {
    expect(UNIT_MINUTES).toBe(50);
    expect(minutesToUnits(50)).toBe(1);
    expect(minutesToUnits(60)).toBe(1.2);
    expect(minutesToUnits(100)).toBe(2);
    expect(minutesToUnits(0)).toBe(0);
    // Ziele der Ausbildung in Einheiten: Standard 600 Behandlungsstunden, 150 SV-Einheiten.
    expect(R.behandlungsstundenZiel).toBe(600);
    expect(R.svEinheitenZiel).toBe(150);
  });
});

describe("totalTherapyHours", () => {
  it("returns 0 for empty array", () => {
    expect(totalTherapyHours([])).toBe(0);
  });

  it("sums minutes and converts to 50-minute units (Behandlungsstunden)", () => {
    const sessions = [
      makeTherapySession({ durationMinutes: 60 }),
      makeTherapySession({ id: newTherapySessionId("ts-2"), durationMinutes: 30 }),
    ];
    expect(totalTherapyHours(sessions)).toBe(1.8);
  });
});

describe("totalSupervisionHours", () => {
  it("returns 0 for empty array", () => {
    expect(totalSupervisionHours([])).toBe(0);
  });

  it("sums minutes and converts to 50-minute units (SV-Einheiten)", () => {
    const sessions = [
      makeSupervisionSession({ durationMinutes: 90 }),
      makeSupervisionSession({ id: newSupervisionSessionId("sv-2"), durationMinutes: 30 }),
    ];
    expect(totalSupervisionHours(sessions)).toBe(2.4);
  });
});

describe("therapyHoursForPatient", () => {
  it("filters by patient ID", () => {
    const sessions = [
      makeTherapySession({ patientId: newPatientId("p-1"), durationMinutes: 60 }),
      makeTherapySession({
        id: newTherapySessionId("ts-2"),
        patientId: newPatientId("p-2"),
        durationMinutes: 120,
      }),
    ];
    expect(therapyHoursForPatient(sessions, newPatientId("p-1"))).toBe(1.2);
  });
});

describe("supervisionHoursForPatient", () => {
  it("verteilt die Dauer gleich auf die besprochenen Fälle, nicht nach Sitzungszahl", () => {
    const ts1 = newTherapySessionId("ts-1");
    const ts2 = newTherapySessionId("ts-2");
    const ts3 = newTherapySessionId("ts-3");
    const therapySessions = [
      makeTherapySession({ id: ts1, patientId: newPatientId("p-1") }),
      makeTherapySession({ id: ts2, patientId: newPatientId("p-1") }),
      makeTherapySession({ id: ts3, patientId: newPatientId("p-2") }),
    ];
    const supervisionSessions = [makeSupervisionSession({ durationMinutes: 50, linkedTherapySessionIds: [ts1, ts2, ts3] })];
    // Zwei Fälle in 50 Min → je 25 Min = 0,5 Einheiten, egal wie viele Sitzungen je Fall
    expect(supervisionHoursForPatient(supervisionSessions, therapySessions, newPatientId("p-1"))).toBe(0.5);
    expect(supervisionHoursForPatient(supervisionSessions, therapySessions, newPatientId("p-2"))).toBe(0.5);
  });

  it("calculates proportional supervision hours", () => {
    const ts1 = newTherapySessionId("ts-1");
    const ts2 = newTherapySessionId("ts-2");

    const therapySessions = [
      makeTherapySession({ id: ts1, patientId: newPatientId("p-1") }),
      makeTherapySession({ id: ts2, patientId: newPatientId("p-2") }),
    ];

    const supervisionSessions = [
      makeSupervisionSession({
        durationMinutes: 60,
        linkedTherapySessionIds: [ts1, ts2], // 50% for each patient
      }),
    ];

    // p-1 has 1 of 2 linked → 50% of 60min = 30min = 0,6 Einheiten
    expect(supervisionHoursForPatient(supervisionSessions, therapySessions, newPatientId("p-1"))).toBe(0.6);
  });

  it("returns 0 when no linked sessions", () => {
    const sessions = [makeSupervisionSession({ linkedTherapySessionIds: [] })];
    expect(supervisionHoursForPatient(sessions, [], newPatientId("p-1"))).toBe(0);
  });
});

describe("calculateRatio", () => {
  it("returns ok for ratio <= 4", () => {
    const result = calculateRatio(4, 1, R);
    expect(result.status).toBe("ok");
    expect(result.isOk).toBe(true);
    expect(result.ratio).toBe(4);
  });

  it("returns warning for ratio > 4 and <= 5", () => {
    const result = calculateRatio(4.5, 1, R);
    expect(result.status).toBe("warning");
    expect(result.isOk).toBe(false);
  });

  it("returns critical for ratio > 5", () => {
    const result = calculateRatio(6, 1, R);
    expect(result.status).toBe("critical");
    expect(result.isOk).toBe(false);
  });

  it("returns Infinity when no supervision hours", () => {
    const result = calculateRatio(10, 0, R);
    expect(result.ratio).toBe(Infinity);
    expect(result.status).toBe("critical");
  });

  it("rounds values to 1 decimal place", () => {
    const result = calculateRatio(3.333, 1.111, R);
    expect(result.therapyHours).toBe(3.3);
    expect(result.supervisionHours).toBe(1.1);
    expect(result.ratio).toBe(3);
  });

  it("boundary: ratio exactly 4 is ok", () => {
    const result = calculateRatio(8, 2, R);
    expect(result.status).toBe("ok");
    expect(result.isOk).toBe(true);
  });

  it("boundary: ratio exactly 5 is warning", () => {
    const result = calculateRatio(5, 1, R);
    expect(result.status).toBe("warning");
    expect(result.isOk).toBe(false);
  });
});

describe("calculateOverallRatio", () => {
  it("combines therapy and supervision totals", () => {
    const therapy = [makeTherapySession({ durationMinutes: 240 })]; // 4 hours
    const supervision = [makeSupervisionSession({ durationMinutes: 60 })]; // 1 hour
    const result = calculateOverallRatio(therapy, supervision, R);
    expect(result.ratio).toBe(4);
    expect(result.status).toBe("ok");
  });
});

describe("calculatePatientRatio", () => {
  it("calculates ratio for a specific patient", () => {
    const patient = makePatient();
    const ts1 = newTherapySessionId("ts-1");
    const therapy = [
      makeTherapySession({ id: ts1, patientId: patient.id, durationMinutes: 240 }),
    ];
    const supervision = [
      makeSupervisionSession({ durationMinutes: 60, linkedTherapySessionIds: [ts1] }),
    ];
    const result = calculatePatientRatio(patient, therapy, supervision, R);
    expect(result.ratio).toBe(4);
    expect(result.status).toBe("ok");
  });
});

describe("getUnsupervisedSessions", () => {
  it("returns sessions not linked to any supervision", () => {
    const ts1 = newTherapySessionId("ts-1");
    const ts2 = newTherapySessionId("ts-2");

    const therapy = [
      makeTherapySession({ id: ts1 }),
      makeTherapySession({ id: ts2 }),
    ];
    const supervision = [
      makeSupervisionSession({ linkedTherapySessionIds: [ts1] }),
    ];

    const result = getUnsupervisedSessions(therapy, supervision);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(ts2);
  });

  it("returns all sessions when no supervision exists", () => {
    const therapy = [makeTherapySession(), makeTherapySession({ id: newTherapySessionId("ts-2") })];
    expect(getUnsupervisedSessions(therapy, [])).toHaveLength(2);
  });

  it("returns empty when all sessions are supervised", () => {
    const ts1 = newTherapySessionId("ts-1");
    const therapy = [makeTherapySession({ id: ts1 })];
    const supervision = [makeSupervisionSession({ linkedTherapySessionIds: [ts1] })];
    expect(getUnsupervisedSessions(therapy, supervision)).toHaveLength(0);
  });
});

describe("calculateQuarterlyFinances", () => {
  it("groups by quarter and calculates income/costs", () => {
    const therapy = [
      makeTherapySession({ date: "2024-01-15", durationMinutes: 60 }),
      makeTherapySession({ id: newTherapySessionId("ts-2"), date: "2024-04-15", durationMinutes: 60 }),
    ];
    const supId = newSupervisorId("sup-1");
    const supervision = [
      makeSupervisionSession({ date: "2024-01-20", durationMinutes: 60, supervisorId: supId }),
    ];

    const result = calculateQuarterlyFinances(
      therapy,
      supervision,
      100, // income per hour
      { [supId]: 80 } // supervision cost per hour
    );

    expect(result).toHaveLength(2);
    // Q1: 60 Min = 1,2 Einheiten Therapie * 100 = 120 income, 1,2 Einheiten Supervision * 80 = 96 costs
    expect(result[0].quarter).toBe("2024 Q1");
    expect(result[0].income).toBe(120);
    expect(result[0].costs).toBe(96);
    expect(result[0].profit).toBe(24);
    // Q2: 1,2 Einheiten Therapie * 100 = 120 income, no costs
    expect(result[1].quarter).toBe("2024 Q2");
    expect(result[1].income).toBe(120);
    expect(result[1].costs).toBe(0);
  });

  it("returns empty for no sessions", () => {
    expect(calculateQuarterlyFinances([], [], 100, {})).toHaveLength(0);
  });
});

describe("calculateQuarterlyFinancesWithGroups", () => {
  it("adds group EBM income into the matching quarter without affecting costs", () => {
    const therapy = [makeTherapySession({ date: "2024-01-15", durationMinutes: 60 })];
    const groupSessions = [
      makeGroupSession({ date: "2024-01-20", status: "durchgefuehrt", childCount: 9 }), // 150.75
      makeGroupSession({ id: newGroupSessionId("gs-2"), date: "2024-04-10", status: "durchgefuehrt", childCount: 5 }), // 112.5
      makeGroupSession({ id: newGroupSessionId("gs-3"), date: "2024-01-25", status: "geplant", childCount: 9 }), // ignoriert
    ];

    const result = calculateQuarterlyFinancesWithGroups(therapy, [], groupSessions, 100, {}, S);

    const q1 = result.find((r) => r.quarter === "2024 Q1")!;
    const q2 = result.find((r) => r.quarter === "2024 Q2")!;
    expect(q1.income).toBe(270.75); // 120 (Therapie, 1,2 Einheiten) + 150.75 (Gruppe)
    expect(q2.income).toBe(112.5); // nur Gruppe, keine Therapiesitzung in Q2
  });
});

describe("remainingContingentForPatient", () => {
  it("returns null when no antrag exists", () => {
    const patient = makePatient({ antragsdatum: null, beantragteStunden: null });
    expect(remainingContingentForPatient(patient, [])).toBeNull();
  });

  it("zählt nur Behandlungssitzungen ab dem Antragsdatum, in Behandlungsstunden à 50 Min", () => {
    const patient = makePatient({ antragsdatum: "2024-06-01", beantragteStunden: 60 });
    const sessions = [
      makeTherapySession({ date: "2024-05-01", category: "probatorik", durationMinutes: 50 }), // vor Antrag, zählt nicht
      makeTherapySession({ id: newTherapySessionId("ts-2"), date: "2024-06-15", category: "behandlung", durationMinutes: 50 }),
      makeTherapySession({ id: newTherapySessionId("ts-3"), date: "2024-06-20", category: "bezugsperson", durationMinutes: 50 }), // andere Kategorie
      makeTherapySession({ id: newTherapySessionId("ts-4"), date: "2024-05-15", category: "behandlung", durationMinutes: 50 }), // vor Antrag
      makeTherapySession({ id: newTherapySessionId("ts-5"), date: "2024-06-01", category: "behandlung", durationMinutes: 25 }), // am Antragstag, halbe Stunde
      makeTherapySession({ id: newTherapySessionId("ts-6"), date: "2024-07-01", category: "behandlung", durationMinutes: 100 }), // Doppelstunde
    ];
    // 60 − (50 + 25 + 100) / 50 = 60 − 3,5
    expect(remainingContingentForPatient(patient, sessions)).toBe(56.5);
  });

  it("kann negativ werden: das Kontingent ist überzogen", () => {
    const patient = makePatient({ antragsdatum: "2024-06-01", beantragteStunden: 1 });
    const sessions = [
      makeTherapySession({ date: "2024-06-15", durationMinutes: 50 }),
      makeTherapySession({ id: newTherapySessionId("ts-2"), date: "2024-06-22", durationMinutes: 60 }),
    ];
    expect(remainingContingentForPatient(patient, sessions)).toBeCloseTo(-1.2, 10);
  });

  it("zählt ab Genehmigung, ohne Genehmigung ab Antrag (#66)", () => {
    const sessions = [
      makeTherapySession({ date: "2026-02-05", durationMinutes: 50, category: "behandlung" }),
      makeTherapySession({ id: newTherapySessionId("ts-2"), date: "2026-03-01", durationMinutes: 50, category: "behandlung" }),
    ];
    const antrag = makePatient({ antragsdatum: "2026-02-01", beantragteStunden: 24, genehmigungsdatum: null });
    expect(remainingContingentForPatient(antrag, sessions)).toBe(22);
    expect(remainingContingentForPatient({ ...antrag, genehmigungsdatum: "2026-02-20" }, sessions)).toBe(23);
  });
});

describe("bezugspersonenStundenForPatient", () => {
  it("sums only bezugsperson-category sessions for the patient", () => {
    const sessions = [
      makeTherapySession({ category: "bezugsperson", durationMinutes: 60 }),
      makeTherapySession({ id: newTherapySessionId("ts-2"), category: "behandlung", durationMinutes: 60 }),
      makeTherapySession({
        id: newTherapySessionId("ts-3"),
        patientId: newPatientId("p-2"),
        category: "bezugsperson",
        durationMinutes: 60,
      }),
    ];
    expect(bezugspersonenStundenForPatient(sessions, newPatientId("p-1"))).toBe(1.2);
  });
});

describe("sessionHoursByCategory", () => {
  it("liefert alle fünf Kategorien in Einheiten à 50 Min (#66)", () => {
    const cats = ["sprechstunde", "probatorik", "behandlung", "bezugsperson", "gespraechsziffer"] as const;
    const sessions = cats.map((category, i) =>
      makeTherapySession({ id: newTherapySessionId(`ts-${i}`), category, durationMinutes: 50 * (i + 1) })
    );
    expect(sessionHoursByCategory(sessions)).toEqual({ sprechstunde: 1, probatorik: 2, behandlung: 3, bezugsperson: 4, gespraechsziffer: 5 });
    expect(sessionHoursByCategory([])).toEqual({ sprechstunde: 0, probatorik: 0, behandlung: 0, bezugsperson: 0, gespraechsziffer: 0 });
  });
});

describe("roundUnits", () => {
  it("rundet Einheiten auf eine Nachkommastelle wie die Behandlungsstunden-Kachel", () => {
    // 50 Minuten = genau eine Behandlungsstunde; krumme Werte (z. B. 2,25) sprengten ungerundet die Kachel auf dem Handy.
    const sessions = [makeTherapySession({ category: "bezugsperson", durationMinutes: 50 })];
    expect(roundUnits(bezugspersonenStundenForPatient(sessions, newPatientId("p-1")))).toBe(1);
    expect(roundUnits(2.25)).toBe(2.3);
    expect(roundUnits(3)).toBe(3);
  });

  it("calculateRatio und hoursRemaining nutzen dieselbe Rundung", () => {
    const r = calculateRatio(minutesToUnits(50), minutesToUnits(25), R);
    expect(r.therapyHours).toBe(1);
    expect(r.supervisionHours).toBe(0.5);
    expect(hoursRemaining(minutesToUnits(55), 600)).toBe(598.9);
  });
});

describe("getEbmFee", () => {
  it("returns null below 3 kids", () => {
    expect(getEbmFee(2, "2026-01-01", S)).toBeNull();
  });

  it("returns exact tier for 3-9 kids", () => {
    expect(getEbmFee(9, "2026-01-01", S)).toEqual({ total: 301.5, share: 150.75 });
    expect(getEbmFee(3, "2026-01-01", S)).toEqual({ total: 177, share: 88.5 });
  });

  it("clamps above 9 kids to the 9er-Stufe", () => {
    expect(getEbmFee(12, "2026-01-01", S)).toEqual({ total: 301.5, share: 150.75 });
  });
});

describe("groupSessionCounts / ambulanzzeitRemaining", () => {
  it("counts sessions by status and Ambulanzzeit progress", () => {
    const sessions = [
      makeGroupSession({ status: "durchgefuehrt", countsTowardAmbulanzzeit: true }),
      makeGroupSession({ id: newGroupSessionId("gs-2"), status: "durchgefuehrt", countsTowardAmbulanzzeit: false }),
      makeGroupSession({ id: newGroupSessionId("gs-3"), status: "ausgefallen" }),
      makeGroupSession({ id: newGroupSessionId("gs-4"), status: "geplant" }),
    ];
    const counts = groupSessionCounts(sessions);
    expect(counts.durchgefuehrt).toBe(2);
    expect(counts.ausgefallen).toBe(1);
    expect(counts.geplant).toBe(1);
    expect(counts.ambulanzzeitCount).toBe(1);
    expect(ambulanzzeitRemaining(sessions, R)).toBe(39);
  });
});

describe("groupIncomeTotal", () => {
  it("sums EBM share only for durchgefuehrt sessions with a child count", () => {
    const sessions = [
      makeGroupSession({ status: "durchgefuehrt", childCount: 9 }), // 150.75
      makeGroupSession({ id: newGroupSessionId("gs-2"), status: "durchgefuehrt", childCount: 5 }), // 112.5
      makeGroupSession({ id: newGroupSessionId("gs-3"), status: "geplant", childCount: 9 }), // ignoriert
    ];
    expect(groupIncomeTotal(sessions, S)).toBe(263.25);
  });
});

describe("linkableTherapySessions", () => {
  it("bietet freie und die selbst zugeordneten Sitzungen an, nicht fremd zugeordnete", () => {
    const s1 = makeTherapySession({ id: newTherapySessionId("ts-1") });
    const s2 = makeTherapySession({ id: newTherapySessionId("ts-2") });
    const s3 = makeTherapySession({ id: newTherapySessionId("ts-3") });
    const mine = makeSupervisionSession({ id: newSupervisionSessionId("sv-1"), linkedTherapySessionIds: [s1.id] });
    const other = makeSupervisionSession({ id: newSupervisionSessionId("sv-2"), linkedTherapySessionIds: [s2.id] });

    const result = linkableTherapySessions([s1, s2, s3], [mine, other], mine.id, "2024-06-01");

    expect(result.map((s) => s.id)).toEqual([s1.id, s3.id]);
  });

  it("bietet keine Sitzungen nach dem Datum der Supervision an – eigene Zuordnungen bleiben abwählbar", () => {
    const before = makeTherapySession({ id: newTherapySessionId("ts-1"), date: "2026-07-20" });
    const after = makeTherapySession({ id: newTherapySessionId("ts-2"), date: "2026-09-24" });
    const ownLate = makeTherapySession({ id: newTherapySessionId("ts-3"), date: "2026-09-25" });
    const mine = makeSupervisionSession({ id: newSupervisionSessionId("sv-1"), date: "2026-07-22", linkedTherapySessionIds: [ownLate.id] });
    expect(linkableTherapySessions([before, after, ownLate], [mine], mine.id, "2026-07-22").map((s) => s.id)).toEqual([before.id, ownLate.id]);
  });
});

describe("linkableGroupSessions", () => {
  it("bietet nur durchgeführte, nicht fremd zugeordnete Doppelstunden an", () => {
    const g1 = makeGroupSession({ id: newGroupSessionId("gs-1") });
    const g2 = makeGroupSession({ id: newGroupSessionId("gs-2") });
    const g3 = makeGroupSession({ id: newGroupSessionId("gs-3"), status: "ausgefallen" });
    const mine = makeSupervisionSession({ id: newSupervisionSessionId("sv-1"), kind: "group", linkedGroupSessionIds: [g1.id] });
    const other = makeSupervisionSession({ id: newSupervisionSessionId("sv-2"), kind: "group", linkedGroupSessionIds: [g2.id] });

    const result = linkableGroupSessions([g1, g2, g3], [mine, other], mine.id);

    expect(result.map((s) => s.id)).toEqual([g1.id]);
  });

  it("behält selbst zugeordnete Doppelstunden auch mit anderem Status, fremde nicht durchgeführte nicht", () => {
    const ownCancelled = makeGroupSession({ id: newGroupSessionId("gs-1"), status: "ausgefallen" });
    const freeCancelled = makeGroupSession({ id: newGroupSessionId("gs-2"), status: "ausgefallen" });
    const ownPlanned = makeGroupSession({ id: newGroupSessionId("gs-3"), status: "geplant" });
    const mine = makeSupervisionSession({
      id: newSupervisionSessionId("sv-1"),
      kind: "group",
      linkedGroupSessionIds: [ownCancelled.id, ownPlanned.id],
    });

    const result = linkableGroupSessions([ownCancelled, freeCancelled, ownPlanned], [mine], mine.id);

    expect(result.map((s) => s.id)).toEqual([ownCancelled.id, ownPlanned.id]);
  });
});

describe("quarterOf", () => {
  it("bildet den Quartalsschlüssel wie die Finanzen-Übersicht, Grenzen inklusive", () => {
    expect(quarterOf("2026-07-01")).toBe("2026 Q3");
    expect(quarterOf("2026-09-30")).toBe("2026 Q3");
    expect(quarterOf("2026-10-01")).toBe("2026 Q4");
    expect(quarterOf("2026-12-31")).toBe("2026 Q4");
    expect(quarterOf("2027-01-01")).toBe("2027 Q1");
  });
});

describe("hoursRemaining / supervisionHoursMissingForRatio", () => {
  it("rechnet die Reststunden bis zum Ziel auf Zehntel, nie negativ", () => {
    expect(hoursRemaining(412.33, 600)).toBe(187.7);
    expect(hoursRemaining(650, 600)).toBe(0);
    expect(hoursRemaining(0, 150)).toBe(150);
  });

  it("sagt, wie viel Supervision für 1:4 jetzt fehlt – aufgerundet auf Zehntel, 0 wenn es passt", () => {
    expect(supervisionHoursMissingForRatio(10, 2, R)).toBe(0.5);
    expect(supervisionHoursMissingForRatio(10, 2.5, R)).toBe(0);
    expect(supervisionHoursMissingForRatio(10, 3, R)).toBe(0);
    expect(supervisionHoursMissingForRatio(0, 0, R)).toBe(0);
    expect(supervisionHoursMissingForRatio(100, 20, R)).toBe(5);
    // 10/4 − 2,46 = 0,04 → 0,1: calculateRatio meldet hier schon „knapp“, der Hinweis darf nicht 0 zeigen.
    expect(supervisionHoursMissingForRatio(10, 2.46, R)).toBe(0.1);
    expect(calculateRatio(10, 2.46, R).status).toBe("warning");
  });

  it("passt zu calculateRatio auf echten Summen aus Sitzungsminuten: fehlt etwas genau dann, wenn das Verhältnis nicht im Soll ist, und reicht der Nachtrag", () => {
    // Summen wie auf Nachweis- und Patient:innen-Seite: totalTherapyHours/totalSupervisionHours über Minuten.
    for (const therapyMinutes of [50, 60, 110, 500, 2450, 36000]) {
      for (const supervisionMinutes of [0, 10, 45, 60, 125, 600, 9000]) {
        const therapy = totalTherapyHours([{ durationMinutes: therapyMinutes } as TherapySession]);
        const supervision = totalSupervisionHours([{ durationMinutes: supervisionMinutes } as SupervisionSession]);
        const missing = supervisionHoursMissingForRatio(therapy, supervision, R);
        const ratio = calculateRatio(therapy, supervision, R);
        expect(missing > 0).toBe(!ratio.isOk);
        expect(calculateRatio(therapy, supervision + missing, R).isOk).toBe(true);
      }
    }
  });
});

describe("Regeln aus dem Regelwerk (#8)", () => {
  it("bewertet das Verhältnis mit den übergebenen Schwellen und nennt das Soll", () => {
    expect(calculateRatio(6, 2, STRENG)).toMatchObject({ ratio: 3, status: "ok", isOk: true, soll: 3 });
    expect(calculateRatio(7, 2, STRENG)).toMatchObject({ ratio: 3.5, status: "warning", isOk: false });
    expect(calculateRatio(8, 2, STRENG)).toMatchObject({ status: "critical" });
    expect(calculateRatio(8, 2, R)).toMatchObject({ status: "ok", soll: 4 });
  });

  it("rechnet fehlende Supervision und Ambulanzzeit-Rest mit den übergebenen Zielen", () => {
    expect(supervisionHoursMissingForRatio(9, 2, STRENG)).toBe(1);
    const sessions = [makeGroupSession({ status: "durchgefuehrt", countsTowardAmbulanzzeit: true })];
    expect(ambulanzzeitRemaining(sessions, STRENG)).toBe(29);
    expect(ambulanzzeitRemaining(sessions, R)).toBe(39);
  });

  it("rechnet das Gruppen-Honorar mit der Staffel am Datum der Doppelstunde", () => {
    expect(getEbmFee(4, "2025-12-31", ZWEI_STAFFELN)).toEqual({ total: 120, share: 60 });
    expect(getEbmFee(4, "2026-01-01", ZWEI_STAFFELN)).toEqual({ total: 130, share: 65 });
    expect(getEbmFee(9, "2026-03-01", ZWEI_STAFFELN)).toEqual({ total: 130, share: 65 });
    const sessions = [
      makeGroupSession({ date: "2025-12-30", childCount: 3 }),
      makeGroupSession({ id: newGroupSessionId("gs-2"), date: "2026-01-02", childCount: 3 }),
    ];
    expect(groupIncomeTotal(sessions, ZWEI_STAFFELN)).toBe(105);
    const quartale = calculateQuarterlyFinancesWithGroups([], [], sessions, 100, {}, ZWEI_STAFFELN);
    expect(quartale.map((q) => [q.quarter, q.income])).toEqual([
      ["2025 Q4", 50],
      ["2026 Q1", 55],
    ]);
  });

  it("rechnet die Finanz-Summen mit der Staffel am Datum der Doppelstunde", () => {
    const sessions = [
      makeGroupSession({ date: "2025-12-30", childCount: 3 }), // 50 (alte Staffel)
      makeGroupSession({ id: newGroupSessionId("gs-2"), date: "2026-01-02", childCount: 4 }), // 65 (neue Staffel)
      makeGroupSession({ id: newGroupSessionId("gs-3"), date: "2026-01-09", status: "geplant", childCount: 4 }), // ignoriert
    ];
    const therapy = [makeTherapySession({ date: "2026-01-05", durationMinutes: 60 })]; // 1,2 × 100 = 120
    const supervision = [makeSupervisionSession({ date: "2026-01-06", durationMinutes: 60 })]; // 1,2 × 90 = 108
    const costs = { [newSupervisorId("sup-1")]: 90 };
    expect(financeTotals(therapy, supervision, sessions, 100, costs, ZWEI_STAFFELN)).toEqual({ totalIncome: 235, totalCosts: 108 });
    expect(financeTotals(therapy, supervision, sessions, 100, costs, S)).toEqual({ totalIncome: 308.5, totalCosts: 108 });
  });
});

describe("supervisionCases", () => {
  const p1 = makePatient({ id: newPatientId("p-1"), chiffre: "B-1" });
  const p2 = makePatient({ id: newPatientId("p-2"), chiffre: "A-2" });
  const session = (id: string, patientId: string, date: string, durationMinutes = 50) =>
    makeTherapySession({ id: newTherapySessionId(id), patientId: newPatientId(patientId), date, durationMinutes });
  const series = (patientId: string, n: number) =>
    Array.from({ length: n }, (_, i) => session(`${patientId}-${i}`, patientId, `2026-07-${String(i + 1).padStart(2, "0")}`));

  it("gruppiert offene Sitzungen je Fall bis zum Datum der Supervision, neueste zuerst", () => {
    const open = [
      session("t-1", "p-1", "2026-07-01"),
      session("t-2", "p-1", "2026-07-08"),
      session("t-3", "p-2", "2026-07-02"),
      session("t-4", "p-2", "2026-09-24"), // nach der Supervision – nie anbieten
    ];
    const cases = supervisionCases(open, [p1, p2], "2026-07-22", R);
    expect(cases.map((c) => [c.patient.chiffre, c.sessionIds, c.openUnits])).toEqual([
      ["B-1", ["t-2", "t-1"], 2],
      ["A-2", ["t-3"], 1],
    ]);
  });

  it("zählt den Tag der Supervision mit", () => {
    expect(supervisionCases([session("t-1", "p-1", "2026-07-22")], [p1], "2026-07-22", R)).toHaveLength(1);
  });

  it("lässt Fälle ohne offene Sitzung und unbekannte Patient:innen weg", () => {
    expect(supervisionCases([session("t-1", "p-9", "2026-07-01")], [p1, p2], "2026-07-22", R)).toEqual([]);
  });

  it("markiert ab der 5. Sitzung ohne Supervision (über dem Soll 1:4), nicht bei der 4.", () => {
    expect(supervisionCases(series("p-1", 4), [p1], "2026-07-31", R)[0].due).toBe(false);
    expect(supervisionCases(series("p-1", 5), [p1], "2026-07-31", R)[0].due).toBe(true);
  });

  it("rechnet in Einheiten à 50 Min und nutzt das Soll aus dem Regelwerk", () => {
    expect(supervisionCases([session("t-1", "p-1", "2026-07-01", 25)], [p1], "2026-07-22", R)[0].openUnits).toBe(0.5);
    expect(supervisionCases(series("p-1", 4), [p1], "2026-07-31", STRENG)[0].due).toBe(true); // Soll 1:3
  });

  it("sortiert nach offenen Einheiten, bei Gleichstand nach Chiffre", () => {
    const open = [session("t-1", "p-1", "2026-07-01"), session("t-2", "p-2", "2026-07-01")];
    expect(supervisionCases(open, [p1, p2], "2026-07-22", R).map((c) => c.patient.chiffre)).toEqual(["A-2", "B-1"]);
  });
});

describe("supervisionDuePatientIds", () => {
  it("liefert die Fälle über dem Soll, zugeordnete Sitzungen zählen nicht", () => {
    const p1 = makePatient({ id: newPatientId("p-1") });
    const p2 = makePatient({ id: newPatientId("p-2"), chiffre: "TEST-002" });
    const s = (id: string, patientId: string) =>
      makeTherapySession({ id: newTherapySessionId(id), patientId: newPatientId(patientId), durationMinutes: 50 });
    const therapy = [...["a", "b", "c", "d", "e"].map((x) => s(x, "p-1")), ...["f", "g", "h", "i", "j"].map((x) => s(x, "p-2"))];
    const sv = [makeSupervisionSession({ linkedTherapySessionIds: [newTherapySessionId("f")] })];
    expect([...supervisionDuePatientIds(therapy, sv, [p1, p2], R)]).toEqual([p1.id]);
  });
});
