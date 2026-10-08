// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildDataExport, DATA_EXPORT_FORMAT, DATA_EXPORT_VERSION } from "../export/data-export";
import { sampleUserData } from "./helpers/user-data-fixture";
import { KEINE_ABWEICHUNGEN } from "../ausbildungsregeln/model";

const NOW = new Date("2026-09-26T10:00:00.000Z");
const invitations = [
  {
    email: "neu@example.com",
    role: "pia" as const,
    createdAt: "2026-05-01T08:00:00.000Z",
    expiresAt: "2026-05-15T08:00:00.000Z",
    usedAt: null,
  },
];

describe("buildDataExport", () => {
  it("hat eine feste, versionierte Form mit allen Datenarten", () => {
    const e = buildDataExport(sampleUserData(), invitations, null, NOW);
    expect(Object.keys(e)).toEqual([
      "format",
      "version",
      "exportedAt",
      "account",
      "patients",
      "supervisors",
      "therapySessions",
      "supervisionSessions",
      "groups",
      "groupSessions",
      "financialSettings",
      "ausbildungsregelnAbweichungen",
      "createdInvitations",
    ]);
    expect(e).toMatchObject({ format: DATA_EXPORT_FORMAT, version: DATA_EXPORT_VERSION, exportedAt: "2026-09-26T10:00:00.000Z" });
    expect(e.format).toBe("therapia-datenexport");
    expect(e.version).toBe(7);
  });

  it("übernimmt die Daten vollständig – Sitzungen, Verknüpfungen, Finanzen, Einladungen, Account", () => {
    const data = sampleUserData();
    const e = buildDataExport(data, invitations, null, NOW);
    expect(e.therapySessions).toHaveLength(data.therapySessions.length);
    expect(e.supervisionSessions[0].linkedTherapySessionIds).toEqual(["t-2", "t-1"]);
    expect(e.financialSettings).toEqual({ incomePerHour: 40, plannedSessionsPerWeek: null });
    expect(e.createdInvitations).toEqual(invitations);
    expect(e.account).toEqual({ id: "u-a", email: "a@example.com", name: "PiA A", role: "pia", createdAt: "2026-01-01T08:00:00.000Z" });
  });

  it("lässt sich als JSON serialisieren, ohne Passwort- oder Token-Felder", () => {
    const json = JSON.stringify(buildDataExport(sampleUserData(), invitations, null, NOW));
    expect(json).not.toMatch(/password|token/i);
    expect(JSON.parse(json).version).toBe(7);
  });

  it("enthält Genehmigungsdatum und Sprechstunden der Ambulanzleitung je Patient:in (#66)", () => {
    const data = sampleUserData();
    data.patients[0].genehmigungsdatum = "2026-03-01";
    data.patients[0].sprechstundenAmbulanz = 2;
    expect(buildDataExport(data, invitations, null, NOW).patients[0]).toMatchObject({ genehmigungsdatum: "2026-03-01", sprechstundenAmbulanz: 2 });
    expect(buildDataExport(sampleUserData(), invitations, null, NOW).patients[1]).toMatchObject({ genehmigungsdatum: null, sprechstundenAmbulanz: 0 });
  });

  it("enthält die persönlichen Ausbildungsregeln der Person (#8)", () => {
    const abweichungen = { ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 };
    expect(buildDataExport(sampleUserData(), invitations, abweichungen, NOW).ausbildungsregelnAbweichungen).toEqual(abweichungen);
    expect(buildDataExport(sampleUserData(), invitations, null, NOW).ausbildungsregelnAbweichungen).toBeNull();
  });

  it("enthält die Wochenplanung – auch 0, null = automatisch (#42)", () => {
    for (const plannedSessionsPerWeek of [12, 0, null]) {
      const data = sampleUserData();
      data.financialSettings.plannedSessionsPerWeek = plannedSessionsPerWeek;
      const json = JSON.parse(JSON.stringify(buildDataExport(data, invitations, null, NOW)));
      expect(json.financialSettings).toEqual({ incomePerHour: 40, plannedSessionsPerWeek });
    }
  });
});
