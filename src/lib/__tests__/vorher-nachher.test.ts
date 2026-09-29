// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestDb, migrateBis, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";
import { loadRegelwerk } from "../services/ausbildungsregeln";
import {
  ambulanzzeitRemaining,
  calculateOverallRatio,
  calculatePatientRatio,
  calculateQuarterlyFinancesWithGroups,
  calculateRatio,
  getEbmFee,
  groupIncomeTotal,
  supervisionHoursMissingForRatio,
} from "../calculations";
import { quarterForecast } from "../quarter-forecast";
import { buildNachweis } from "../nachweis";
import { standardRegelwerk } from "../ausbildungsregeln/resolve";
import type { EbmStaffel, Regelwerk } from "../ausbildungsregeln/model";
import { alsSnapshot, berechneKennzahlen, type RegelApi } from "./helpers/vorher-nachher";

const SNAPSHOT = "./__snapshots__/vorher-nachher-kennzahlen.json";

// Ab #8: dieselben Funktionen, alle Regeln (auch die EBM-Staffel) kommen aus einem Regelwerk.
function apiAus(regelwerk: Regelwerk): RegelApi {
  const R = regelwerk.regeln;
  return {
    ziele: {
      behandlungsstunden: R.behandlungsstundenZiel,
      svEinheiten: R.svEinheitenZiel,
      gruppeDoppelstunden: R.gruppeDoppelstundenZiel,
      gruppeAmbulanzzeit: R.gruppeAmbulanzzeitZiel,
    },
    calculateRatio: (a, b) => calculateRatio(a, b, R),
    calculateOverallRatio: (t, s) => calculateOverallRatio(t, s, R),
    calculatePatientRatio: (p, t, s) => calculatePatientRatio(p, t, s, R),
    supervisionHoursMissingForRatio: (a, b) => supervisionHoursMissingForRatio(a, b, R),
    ambulanzzeitRemaining: (g) => ambulanzzeitRemaining(g, R),
    getEbmFee: (kinder, date) => getEbmFee(kinder, date, regelwerk.ebmStaffeln),
    groupIncomeTotal: (g) => groupIncomeTotal(g, regelwerk.ebmStaffeln),
    calculateQuarterlyFinancesWithGroups: (t, s, g, income, costs) =>
      calculateQuarterlyFinancesWithGroups(t, s, g, income, costs, regelwerk.ebmStaffeln),
    quarterForecast: (input) => quarterForecast({ ...input, ebmStaffeln: regelwerk.ebmStaffeln }),
    buildNachweis: (data, filter, now) => buildNachweis(data, filter, regelwerk, now),
  };
}
const api = apiAus(standardRegelwerk());

describe("Vorher = Nachher (#8): Kennzahlen", () => {
  it("rechnet Dashboard, Prognose, Finanzen, Gruppen und Nachweis wie vor der Umstellung", async () => {
    await expect(alsSnapshot(berechneKennzahlen(api))).toMatchFileSnapshot(SNAPSHOT);
  });
});

// Vergleich mit derselben Datei, ohne sie je zu schreiben: der erste Test oben hält sie per toMatchFileSnapshot fest.
const erwartet = () => readFileSync(path.join(__dirname, SNAPSHOT), "utf8");
const ohneIds = (staffeln: EbmStaffel[]) => staffeln.map(({ gueltigAb, stufen }) => ({ gueltigAb, stufen }));

describe.skipIf(!TEST_DATABASE_URL)("Vorher = Nachher (#8): Regelwerk aus der Datenbank", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("frische Instanz nach Migration 005 rechnet wie vorher", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    const regelwerk = await loadRegelwerk(t.client, f.a.userId);
    // Negativkontrolle: das Regelwerk stammt wirklich aus der Datenbank, nicht aus dem Code-Standard.
    expect(regelwerk.basisQuelle).toBe("instanz");
    expect(typeof regelwerk.ebmStaffeln[0].id).toBe("string");
    expect(regelwerk.regeln).toEqual(standardRegelwerk().regeln);
    expect(regelwerk.abweichend).toEqual([]);
    expect(ohneIds(regelwerk.ebmStaffeln)).toEqual(ohneIds(standardRegelwerk().ebmStaffeln));
    expect(alsSnapshot(berechneKennzahlen(apiAus(regelwerk)))).toBe(erwartet());
  });

  it("bestehende Instanz (Stand 004 mit Daten) rechnet nach dem Update wie vorher – für jeden Account", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    await migrateBis(t.client, "004_planned_sessions_per_week.sql");
    const f = await seedOwnershipFixture(t.client);
    expect(await migrateBis(t.client, "005_ausbildungsregeln.sql")).toEqual(["005_ausbildungsregeln.sql"]);
    for (const userId of [f.a.userId, f.b.userId]) {
      const regelwerk = await loadRegelwerk(t.client, userId);
      expect(regelwerk.basisQuelle).toBe("instanz");
      expect(typeof regelwerk.ebmStaffeln[0].id).toBe("string");
      expect(regelwerk.regeln).toEqual(standardRegelwerk().regeln);
      expect(alsSnapshot(berechneKennzahlen(apiAus(regelwerk)))).toBe(erwartet());
    }
  });

  it("ohne Profil- und Staffelzeilen (Code-Standard) rechnet wie vorher", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    await t.client.query("DELETE FROM ausbildungsprofil");
    await t.client.query("DELETE FROM ebm_staffeln");
    const regelwerk = await loadRegelwerk(t.client, f.a.userId);
    expect(regelwerk.basisQuelle).toBe("standard");
    expect(regelwerk.ebmStaffeln.map((s) => s.id)).toEqual([null]);
    expect(alsSnapshot(berechneKennzahlen(apiAus(regelwerk)))).toBe(erwartet());
  });

  // Negativkontrolle: geänderte Werte in der Datenbank müssen im Vergleich auffallen – sonst bewiese der Vergleich
  // oben nichts. Die Snapshot-Datei wird dabei nur gelesen.
  it("geänderte Werte in Profil oder Staffel weichen vom eingefrorenen Ergebnis ab", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);

    await t.client.query("UPDATE ausbildungsprofil SET behandlungsstunden_ziel = 599");
    const profilGeaendert = await loadRegelwerk(t.client, f.a.userId);
    expect(profilGeaendert.regeln.behandlungsstundenZiel).toBe(599);
    expect(alsSnapshot(berechneKennzahlen(apiAus(profilGeaendert)))).not.toBe(erwartet());

    await t.client.query("UPDATE ausbildungsprofil SET behandlungsstunden_ziel = 600");
    await t.client.query("UPDATE ebm_staffel_stufen SET honorar_gesamt = 178 WHERE kinderzahl = 3");
    const staffelGeaendert = await loadRegelwerk(t.client, f.a.userId);
    expect(staffelGeaendert.regeln).toEqual(standardRegelwerk().regeln);
    expect(alsSnapshot(berechneKennzahlen(apiAus(staffelGeaendert)))).not.toBe(erwartet());
  });
});
