// @vitest-environment node
import { describe, it, expect } from "vitest";
import { addDaysIso, generateDemoData } from "../demo/demo-daten.mjs";
import {
  calculateOverallRatio,
  calculatePatientRatio,
  getUnsupervisedSessions,
  groupSessionCounts,
  remainingContingentForPatient,
} from "../calculations";
import { standardRegelwerk } from "../ausbildungsregeln/resolve";
import type {
  GroupId,
  GroupSession,
  GroupSessionId,
  Patient,
  PatientId,
  SupervisionSession,
  SupervisionSessionId,
  SupervisorId,
  TherapySession,
  TherapySessionId,
} from "@/types";

type DemoData = ReturnType<typeof generateDemoData>;

const STICHTAG = "2026-09-28";
const regeln = standardRegelwerk().regeln;

// Schlüssel als IDs: so rechnen die Funktionen der App direkt auf den Beispieldaten, ohne Datenbank.
function alsDomaene(data: DemoData) {
  const patients: Patient[] = data.patients.map((p) => ({
    id: p.key as PatientId,
    chiffre: p.chiffre,
    therapyType: p.therapyType,
    startDate: p.startDate,
    endDate: p.endDate,
    isActive: p.isActive,
    createdAt: "2026-01-01T00:00:00.000Z",
    antragsdatum: p.antragsdatum,
    beantragteStunden: p.beantragteStunden,
    genehmigungsdatum: p.genehmigungsdatum,
    sprechstundenAmbulanz: p.sprechstundenAmbulanz,
  }));
  const therapySessions: TherapySession[] = data.therapySessions.map((s) => ({
    id: s.key as TherapySessionId,
    patientId: s.patient as PatientId,
    date: s.date,
    durationMinutes: s.durationMinutes,
    notes: s.notes,
    category: s.category,
  }));
  const supervisionSessions: SupervisionSession[] = data.supervisionSessions.map((s) => ({
    id: s.key as SupervisionSessionId,
    supervisorId: s.supervisor as SupervisorId,
    date: s.date,
    durationMinutes: s.durationMinutes,
    kind: s.kind,
    setting: "einzel",
    linkedTherapySessionIds: s.therapySessions as TherapySessionId[],
    linkedGroupSessionIds: s.groupSessions as GroupSessionId[],
    groupId: (s.group ?? null) as GroupId | null,
    caseShares: s.cases.map((c) => ({ patientId: c.patient as PatientId, minutes: c.minutes })),
  }));
  const groupSessions: GroupSession[] = data.groupSessions.map((g) => ({
    id: g.key as GroupSessionId,
    groupId: g.group as GroupId,
    date: g.date,
    status: g.status,
    childCount: g.childCount,
    countsTowardAmbulanzzeit: g.countsTowardAmbulanzzeit,
    durationMinutes: g.durationMinutes,
    notes: g.notes,
  }));
  return { patients, therapySessions, supervisionSessions, groupSessions };
}

function alleDaten(data: DemoData): string[] {
  return [
    ...data.patients.flatMap((p) => [p.startDate, p.endDate, p.antragsdatum]),
    ...data.therapySessions.map((s) => s.date),
    ...data.supervisionSessions.map((s) => s.date),
    ...data.groups.map((g) => g.startDate),
    ...data.groupSessions.map((g) => g.date),
  ].filter((d): d is string => d !== null);
}

const quartal = (iso: string) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;

describe("addDaysIso", () => {
  it("rechnet Kalendertage ohne Zeitzone – über Monats-, Jahres- und Schaltjahresgrenzen", () => {
    expect(addDaysIso("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2024-03-01", -1)).toBe("2024-02-29");
    expect(() => addDaysIso("28.09.2026", 1)).toThrow(/JJJJ-MM-TT/);
  });
});

describe("generateDemoData", () => {
  const data = generateDemoData(STICHTAG);

  it("erzeugt die zugesagten Mengen", () => {
    expect(data.patients.map((p) => p.chiffre)).toEqual(["A-1041", "B-2317", "C-3082", "D-4265", "E-5119"]);
    expect(data.supervisors).toHaveLength(2);
    expect(data.therapySessions).toHaveLength(159);
    expect(data.therapySessions.every((s) => s.durationMinutes === 50)).toBe(true);
    expect(data.supervisionSessions.filter((s) => s.kind === "individual")).toHaveLength(32);
    expect(data.supervisionSessions.filter((s) => s.kind === "group")).toHaveLength(7);
    expect(data.groups.map((g) => g.name)).toEqual(["Gruppe Beispiel"]);
    expect(data.groupSessions).toHaveLength(32);
    expect(data.financialSettings).toEqual({ incomePerHour: 70, plannedSessionsPerWeek: null });
  });

  it("zeigt mit den Standard-Ausbildungsregeln alle Zustände: passt, knapp, Supervision fehlt", () => {
    const d = alsDomaene(data);
    const gesamt = calculateOverallRatio(d.therapySessions, d.supervisionSessions, regeln);
    expect(gesamt.status).toBe("ok");
    expect(gesamt.ratio).toBe(2.7);
    const status = Object.fromEntries(
      d.patients.map((p) => [p.chiffre, calculatePatientRatio(p, d.therapySessions, d.supervisionSessions, regeln).status])
    );
    expect(status).toEqual({ "A-1041": "ok", "B-2317": "ok", "C-3082": "ok", "D-4265": "warning", "E-5119": "critical" });
    expect(getUnsupervisedSessions(d.therapySessions, d.supervisionSessions)).toHaveLength(15);
    expect(groupSessionCounts(d.groupSessions)).toEqual({
      durchgefuehrt: 25,
      ausgefallen: 3,
      urlaub: 2,
      geplant: 2,
      ambulanzzeitCount: 23,
    });
    const rest = Object.fromEntries(d.patients.map((p) => [p.chiffre, remainingContingentForPatient(p, d.therapySessions)]));
    expect(rest).toEqual({ "A-1041": 2, "B-2317": 33, "C-3082": 3, "D-4265": 49, "E-5119": null });
  });

  it("legt nichts nach dem Stichtag an – außer zwei geplanten Doppelstunden", () => {
    expect(data.therapySessions.every((s) => s.date <= STICHTAG)).toBe(true);
    expect(data.therapySessions.map((s) => s.date).sort().at(-1)).toBe("2026-09-27");
    expect(data.supervisionSessions.every((s) => s.date <= STICHTAG)).toBe(true);
    const zukunft = data.groupSessions.filter((g) => g.date > STICHTAG);
    expect(zukunft.map((g) => [g.status, g.date])).toEqual([
      ["geplant", "2026-09-29"],
      ["geplant", "2026-10-06"],
    ]);
  });

  it("verteilt die Sitzungen über sechs Quartale", () => {
    expect([...new Set(data.therapySessions.map((s) => quartal(s.date)))].sort()).toEqual([
      "2025-Q2",
      "2025-Q3",
      "2025-Q4",
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
    ]);
  });

  it("bespricht in einer Supervision nur Sitzungen, die vorher stattfanden", () => {
    const datum = new Map([...data.therapySessions, ...data.groupSessions].map((s) => [s.key, s.date]));
    for (const sv of data.supervisionSessions) {
      for (const key of [...sv.therapySessions, ...sv.groupSessions]) expect(datum.get(key)! <= sv.date).toBe(true);
      expect(sv.therapySessions.length + sv.groupSessions.length).toBeGreaterThan(0);
    }
  });

  it("ist deterministisch und verschiebt sich mit dem Stichtag nur im Datum", () => {
    expect(generateDemoData(STICHTAG)).toEqual(data);
    const spaeter = generateDemoData("2027-03-15"); // 168 Tage später
    expect(alleDaten(spaeter)).toEqual(alleDaten(data).map((d) => addDaysIso(d, 168)));
    expect(spaeter.therapySessions.map((s) => [s.key, s.category, s.notes])).toEqual(
      data.therapySessions.map((s) => [s.key, s.category, s.notes])
    );
  });

  it("enthält nur fiktive Angaben – Chiffren, Rollenbezeichnungen, keine Adressen", () => {
    expect(data.patients.every((p) => /^[A-E]-\d{4}$/.test(p.chiffre))).toBe(true);
    expect(data.supervisors.map((s) => s.name)).toEqual(["Supervisor:in A", "Supervisor:in B"]);
    expect(new Set(data.therapySessions.map((s) => s.notes))).toEqual(new Set(["", "Erstgespräch", "Bezugspersonengespräch"]));
    expect(JSON.stringify(data)).not.toMatch(/@/);
  });

  it("lehnt einen Stichtag ab, der kein gültiges Datum ist", () => {
    expect(() => generateDemoData("28.09.2026")).toThrow(/JJJJ-MM-TT/);
    expect(() => generateDemoData("2026-02-30")).toThrow(/Kein gültiges Datum/);
  });
});
