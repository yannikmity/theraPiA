// @vitest-environment node
import { describe, it, expect } from "vitest";
import { firstRecordDate, matchingPreset, nachweisHref, PERIOD_PRESET_LABELS, PERIOD_PRESETS, presetPeriod } from "../nachweis-periods";
import { sampleUserData } from "./helpers/user-data-fixture";

const TODAY = new Date(2026, 8, 26); // 26.09.2026, lokal

describe("Zeitraum-Vorgaben", () => {
  it("kennt drei Vorgaben mit Beschriftung", () => {
    expect(PERIOD_PRESETS).toEqual(["quartal", "vorquartal", "gesamt"]);
    expect(PERIOD_PRESET_LABELS).toEqual({ quartal: "Aktuelles Quartal", vorquartal: "Letztes Quartal", gesamt: "Ausbildung gesamt" });
  });

  it("rechnet aktuelles und letztes Quartal aus dem heutigen Datum", () => {
    expect(presetPeriod("quartal", TODAY, null)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(presetPeriod("vorquartal", TODAY, null)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(presetPeriod("vorquartal", new Date(2026, 0, 15), null)).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });

  it("„gesamt“ reicht vom ersten Eintrag bis heute, ohne Einträge nur heute", () => {
    expect(presetPeriod("gesamt", TODAY, "2025-10-06")).toEqual({ from: "2025-10-06", to: "2026-09-26" });
    expect(presetPeriod("gesamt", TODAY, null)).toEqual({ from: "2026-09-26", to: "2026-09-26" });
  });

  it("erkennt, welche Vorgabe einem Zeitraum entspricht", () => {
    expect(matchingPreset({ from: "2026-07-01", to: "2026-09-30" }, TODAY, null)).toBe("quartal");
    expect(matchingPreset({ from: "2025-10-06", to: "2026-09-26" }, TODAY, "2025-10-06")).toBe("gesamt");
    expect(matchingPreset({ from: "2026-01-01", to: "2026-03-31" }, TODAY, null)).toBeNull();
  });

  it("findet das früheste Datum über Behandlungsbeginn, Sitzungen, Supervisionen und Gruppen", () => {
    expect(firstRecordDate(sampleUserData())).toBe("2026-01-05");
    const data = sampleUserData();
    data.supervisionSessions[0].date = "2025-12-24";
    expect(firstRecordDate(data)).toBe("2025-12-24");
    const doppelstundeZuerst = sampleUserData();
    doppelstundeZuerst.groupSessions[1].date = "2025-11-03";
    expect(firstRecordDate(doppelstundeZuerst)).toBe("2025-11-03");
    expect(firstRecordDate({ ...data, patients: [], therapySessions: [], supervisionSessions: [], groups: [], groupSessions: [] })).toBeNull();
  });

  it("baut die Adresse der Nachweis-Seite aus dem Filter", () => {
    expect(nachweisHref({ from: "2026-01-01", to: "2026-03-31", supervisorId: null })).toBe("/nachweis?from=2026-01-01&to=2026-03-31");
    expect(nachweisHref({ from: "2026-01-01", to: "2026-03-31", supervisorId: "550e8400-e29b-41d4-a716-446655440000" })).toBe(
      "/nachweis?from=2026-01-01&to=2026-03-31&supervisor=550e8400-e29b-41d4-a716-446655440000"
    );
  });
});
