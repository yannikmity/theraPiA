// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  lastCategoryByPatient,
  lastUsedPatientId,
  lastWeekSuggestions,
  resolveInitialPatientId,
  resolveInitialType,
} from "../quick-capture";
import { newPatientId, newTherapySessionId, type Patient, type TherapySession } from "@/types";

const P1 = newPatientId("p-1");
const P2 = newPatientId("p-2");
const P3 = newPatientId("p-3"); // abgeschlossen

function patient(id: typeof P1, chiffre: string, isActive = true): Patient {
  return {
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
  };
}

let n = 0;
function session(patientId: typeof P1, date: string, overrides: Partial<TherapySession> = {}): TherapySession {
  return {
    id: newTherapySessionId(`t-${++n}`),
    patientId,
    date,
    durationMinutes: 50,
    notes: "",
    category: "behandlung",
    ...overrides,
  };
}

const patients = [patient(P1, "A-1"), patient(P2, "A-2"), patient(P3, "A-3", false)];
const TODAY = "2026-09-27"; // Sonntag

describe("Vorbelegung", () => {
  it("nimmt die Patient:in der jüngsten Sitzung, überspringt abgeschlossene Behandlungen", () => {
    const sessions = [session(P1, "2026-09-01"), session(P3, "2026-09-20"), session(P2, "2026-09-10")];
    expect(lastUsedPatientId(sessions, patients)).toBe(P2);
    expect(lastUsedPatientId([], patients)).toBeNull();
    expect(lastUsedPatientId([session(P3, "2026-09-20")], patients)).toBeNull();
  });

  it("bei gleichem Datum gilt die Reihenfolge der Liste (jüngst angelegte zuerst)", () => {
    expect(lastUsedPatientId([session(P2, "2026-09-10"), session(P1, "2026-09-10")], patients)).toBe(P2);
  });

  it("merkt sich die letzte Kategorie je Patient:in", () => {
    const sessions = [
      session(P1, "2026-09-01", { category: "probatorik" }),
      session(P1, "2026-09-08", { category: "behandlung" }),
      session(P2, "2026-09-03", { category: "bezugsperson" }),
    ];
    expect(lastCategoryByPatient(sessions)).toEqual({ [P1]: "behandlung", [P2]: "bezugsperson" });
  });

  it("Adresse vor zuletzt genutzt vor erster aktiver Patient:in; Unbekanntes wird ignoriert", () => {
    const active = patients.filter((p) => p.isActive);
    expect(resolveInitialPatientId(P2, active, P1)).toBe(P2);
    expect(resolveInitialPatientId(P3, active, P1)).toBe(P1); // abgeschlossen → nicht wählbar
    expect(resolveInitialPatientId("fremd", active, null)).toBe(P1);
    expect(resolveInitialPatientId(undefined, [], null)).toBe("");
    expect(resolveInitialType("supervision")).toBe("supervision");
    expect(resolveInitialType("x")).toBe("therapie");
    expect(resolveInitialType(undefined)).toBe("therapie");
  });
});

describe("Wie letzte Woche", () => {
  it("verschiebt Sitzungen von vor 7 bis 13 Tagen um eine Woche – Grenzen inklusive, nie in die Zukunft", () => {
    const sessions = [
      session(P1, "2026-09-13"), // vor 14 Tagen: zu alt
      session(P1, "2026-09-14"), // vor 13 Tagen → 21.09.
      session(P2, "2026-09-20", { durationMinutes: 60, category: "probatorik" }), // vor 7 Tagen → heute
      // vor 6 Tagen: Ziel läge in der Zukunft. Bewusst P2 – eine P1-Sitzung am 21.09. wäre zugleich eine
      // bestehende Sitzung am Zieltag der Quelle vom 14.09. und würde diese als Doppelte ausblenden.
      session(P2, "2026-09-21"),
    ];
    const result = lastWeekSuggestions(sessions, patients, TODAY);
    expect(result.map((s) => [s.chiffre, s.sourceDate, s.date, s.durationMinutes, s.category])).toEqual([
      ["A-1", "2026-09-14", "2026-09-21", 50, "behandlung"],
      ["A-2", "2026-09-20", "2026-09-27", 60, "probatorik"],
    ]);
    expect(result[0].patientId).toBe(P1);
    expect(result[0].sourceSessionId).toBe(sessions[1].id);
  });

  it("lässt Doppelte aus: bestehende Sitzung am Zieltag derselben Patient:in, zwei Quellen für denselben Tag", () => {
    const sessions = [
      session(P1, "2026-09-15"), // → 22.09., gibt es schon
      session(P1, "2026-09-22"),
      session(P2, "2026-09-16", { category: "probatorik" }), // → 23.09.
      session(P2, "2026-09-16", { category: "behandlung" }), // zweite Sitzung am selben Tag → nur eine Zeile
    ];
    const result = lastWeekSuggestions(sessions, patients, TODAY);
    expect(result.map((s) => [s.chiffre, s.date, s.category])).toEqual([["A-2", "2026-09-23", "probatorik"]]);
  });

  it("lässt ein Ziel aus, wenn es am Zieltag schon eine Sitzung derselben Patient:in gibt – auch am Rand des Fensters", () => {
    const sessions = [
      session(P1, "2026-09-14"), // vor 13 Tagen → 21.09., gibt es schon
      session(P1, "2026-09-21"), // vor 6 Tagen: selbst keine Quelle
      session(P2, "2026-09-20"), // vor 7 Tagen → heute, gibt es schon
      session(P2, "2026-09-27"),
      session(P1, "2026-09-20"), // → heute, P1 hat heute noch nichts
    ];
    const result = lastWeekSuggestions(sessions, patients, TODAY);
    expect(result.map((s) => `${s.date} ${s.chiffre}`)).toEqual(["2026-09-27 A-1"]);
  });

  it("überspringt abgeschlossene Behandlungen und sortiert nach Zieltag, dann Chiffre", () => {
    const sessions = [session(P3, "2026-09-16"), session(P2, "2026-09-14"), session(P1, "2026-09-14"), session(P1, "2026-09-18")];
    const result = lastWeekSuggestions(sessions, patients, TODAY);
    expect(result.map((s) => `${s.date} ${s.chiffre}`)).toEqual(["2026-09-21 A-1", "2026-09-21 A-2", "2026-09-25 A-1"]);
  });

  it("sortiert Chiffren natürlich: A-2 vor A-10", () => {
    const many = [patient(P1, "A-10"), patient(P2, "A-2")];
    const sessions = [session(P1, "2026-09-14"), session(P2, "2026-09-14")];
    expect(lastWeekSuggestions(sessions, many, TODAY).map((s) => s.chiffre)).toEqual(["A-2", "A-10"]);
  });

  it("ist ohne Sitzungen leer", () => {
    expect(lastWeekSuggestions([], patients, TODAY)).toEqual([]);
  });
});
