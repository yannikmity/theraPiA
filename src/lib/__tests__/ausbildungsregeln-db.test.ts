// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";
import { KEINE_ABWEICHUNGEN, type Ausbildungsregeln, type EbmStaffel } from "../ausbildungsregeln/model";
import { standardRegelwerk } from "../ausbildungsregeln/resolve";
import {
  deleteEbmStaffel,
  loadAusbildungsprofilDaten,
  loadEbmStaffeln,
  loadEbmStaffelnFuerPflege,
  loadRegelwerk,
  MELDUNG_DATUM_VERGEBEN,
  MELDUNG_LETZTE_STAFFEL,
  resetAbweichungen,
  resetInstanzprofil,
  saveAbweichungen,
  saveEbmStaffel,
  saveInstanzprofil,
} from "../services/ausbildungsregeln";
import { NotFoundError, ValidationError } from "../errors";

const INSTANZ: Ausbildungsregeln = {
  behandlungsstundenZiel: 500,
  svEinheitenZiel: 125,
  verhaeltnisWarnung: 3.5,
  verhaeltnisKritisch: 4.5,
  gruppeDoppelstundenZiel: 50,
  gruppeAmbulanzzeitZiel: 30,
};
const ohneIds = (staffeln: EbmStaffel[]) => staffeln.map(({ gueltigAb, stufen }) => ({ gueltigAb, stufen }));
const UNBEKANNT = "550e8400-e29b-41d4-a716-446655440099";

// Transaktion wie withTransaction, auf der Testverbindung.
async function inTransaktion<T>(client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

// Ohne den Seiteneffekt-Import von pg-types liefert pg NUMERIC als Text – loadEbmStaffeln muss trotzdem Zahlen liefern.
describe("loadEbmStaffeln ohne Typ-Parser", () => {
  it("wandelt NUMERIC-Text in Zahlen", async () => {
    const roh = { query: async () => ({ rows: [{ id: "s1", gueltig_ab: "2000-01-01", kinderzahl: 3, honorar_gesamt: "177.00", honorar_anteil: "88.50" }] }) };
    expect(await loadEbmStaffeln(roh as unknown as Client)).toEqual([
      { id: "s1", gueltigAb: "2000-01-01", stufen: [{ kinderzahl: 3, total: 177, share: 88.5 }] },
    ]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("Ausbildungsregeln (Datenbank)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    return { db: t.client, f };
  }

  it("lädt nach der Migration dieselben Regeln wie die Code-Standardwerte", async () => {
    const { db, f } = await setup();
    const r = await loadRegelwerk(db, f.a.userId);
    const standard = standardRegelwerk();
    expect(r.regeln).toEqual(standard.regeln);
    expect(r.basisQuelle).toBe("instanz");
    expect(r.abweichend).toEqual([]);
    expect(ohneIds(r.ebmStaffeln)).toEqual(ohneIds(standard.ebmStaffeln));
    expect(r.ebmStaffeln[0].id).toEqual(expect.any(String));
  });

  it("fällt ohne Zeilen auf die Code-Standardwerte zurück", async () => {
    const { db, f } = await setup();
    await db.query("DELETE FROM ausbildungsprofil");
    await db.query("DELETE FROM ebm_staffeln");
    expect(await loadRegelwerk(db, f.a.userId)).toEqual(standardRegelwerk());
    expect(await loadEbmStaffeln(db)).toEqual([]);
    expect(await loadEbmStaffelnFuerPflege(db)).toEqual(standardRegelwerk().ebmStaffeln);
    expect(await loadAusbildungsprofilDaten(db)).toEqual({
      regeln: standardRegelwerk().regeln,
      quelle: "standard",
      standard: standardRegelwerk().regeln,
    });
  });

  it("speichert das Instanzprofil als eine Zeile und setzt es zurück", async () => {
    const { db, f } = await setup();
    await saveInstanzprofil(db, INSTANZ);
    await saveInstanzprofil(db, { ...INSTANZ, behandlungsstundenZiel: 550 });
    expect((await db.query("SELECT count(*)::int AS n FROM ausbildungsprofil")).rows[0].n).toBe(1);
    expect((await loadRegelwerk(db, f.a.userId)).regeln).toEqual({ ...INSTANZ, behandlungsstundenZiel: 550 });
    expect((await loadAusbildungsprofilDaten(db)).quelle).toBe("instanz");
    await resetInstanzprofil(db);
    expect((await loadRegelwerk(db, f.a.userId)).basisQuelle).toBe("standard");
  });

  it("speichert Abweichungen nur für den eigenen Account; alles null löscht die Zeile", async () => {
    const { db, f } = await setup();
    await saveInstanzprofil(db, INSTANZ);
    await saveAbweichungen(db, f.a.userId, { ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450, verhaeltnisWarnung: 3, verhaeltnisKritisch: 4 });
    const a = await loadRegelwerk(db, f.a.userId);
    expect(a.regeln).toEqual({ ...INSTANZ, behandlungsstundenZiel: 450, verhaeltnisWarnung: 3, verhaeltnisKritisch: 4 });
    expect(a.basis).toEqual(INSTANZ);
    expect(a.abweichend).toEqual(["behandlungsstundenZiel", "verhaeltnisWarnung", "verhaeltnisKritisch"]);
    expect((await loadRegelwerk(db, f.b.userId)).regeln).toEqual(INSTANZ);

    await saveAbweichungen(db, f.a.userId, { ...KEINE_ABWEICHUNGEN, svEinheitenZiel: 100 });
    expect((await loadRegelwerk(db, f.a.userId)).abweichend).toEqual(["svEinheitenZiel"]);
    await saveAbweichungen(db, f.a.userId, KEINE_ABWEICHUNGEN);
    expect((await db.query("SELECT count(*)::int AS n FROM ausbildungsregeln_abweichungen")).rows[0].n).toBe(0);

    await saveAbweichungen(db, f.b.userId, { ...KEINE_ABWEICHUNGEN, svEinheitenZiel: 100 });
    await resetAbweichungen(db, f.a.userId);
    expect((await loadRegelwerk(db, f.b.userId)).abweichend).toEqual(["svEinheitenZiel"]);
  });

  it("legt Staffeln an, ersetzt beim Bearbeiten die Stufen und meldet ein vergebenes Datum am Feld", async () => {
    const { db } = await setup();
    const id = await inTransaktion(db, (tx) =>
      saveEbmStaffel(tx, { id: null, gueltigAb: "2027-01-01", stufen: [{ kinderzahl: 3, total: 180, share: 90 }] })
    );
    await inTransaktion(db, (tx) =>
      saveEbmStaffel(tx, {
        id,
        gueltigAb: "2027-04-01",
        stufen: [
          { kinderzahl: 4, total: 205, share: 102.5 },
          { kinderzahl: 5, total: 230, share: 115 },
        ],
      })
    );
    const neu = (await loadEbmStaffeln(db)).find((s) => s.id === id)!;
    expect(neu).toEqual({
      id,
      gueltigAb: "2027-04-01",
      stufen: [
        { kinderzahl: 4, total: 205, share: 102.5 },
        { kinderzahl: 5, total: 230, share: 115 },
      ],
    });

    const doppelt = inTransaktion(db, (tx) =>
      saveEbmStaffel(tx, { id: null, gueltigAb: "2000-01-01", stufen: [{ kinderzahl: 3, total: 1, share: 1 }] })
    );
    await expect(doppelt).rejects.toBeInstanceOf(ValidationError);
    await expect(doppelt).rejects.toMatchObject({ fieldErrors: { gueltigAb: [MELDUNG_DATUM_VERGEBEN] } });
    await expect(
      inTransaktion(db, (tx) => saveEbmStaffel(tx, { id: UNBEKANNT, gueltigAb: "2028-01-01", stufen: [{ kinderzahl: 3, total: 1, share: 1 }] }))
    ).rejects.toBeInstanceOf(NotFoundError);
    // Andere Eindeutigkeitsverletzungen (hier: doppelte Kinderzahl am Schema vorbei) sind kein vergebenes Datum.
    const doppelteStufe = inTransaktion(db, (tx) =>
      saveEbmStaffel(tx, {
        id: null,
        gueltigAb: "2028-01-01",
        stufen: [
          { kinderzahl: 3, total: 1, share: 1 },
          { kinderzahl: 3, total: 1, share: 1 },
        ],
      })
    );
    await expect(doppelteStufe).rejects.toMatchObject({ code: "23505", constraint: "ebm_staffel_stufen_pkey" });
    await expect(doppelteStufe).rejects.not.toBeInstanceOf(ValidationError);
    expect(await loadEbmStaffeln(db)).toHaveLength(2);
  });

  it("löscht Staffeln, aber nie die letzte", async () => {
    const { db } = await setup();
    const [standard] = await loadEbmStaffeln(db);
    await expect(inTransaktion(db, (tx) => deleteEbmStaffel(tx, standard.id!))).rejects.toMatchObject({ message: MELDUNG_LETZTE_STAFFEL });
    const id = await inTransaktion(db, (tx) =>
      saveEbmStaffel(tx, { id: null, gueltigAb: "2027-01-01", stufen: [{ kinderzahl: 3, total: 180, share: 90 }] })
    );
    await inTransaktion(db, (tx) => deleteEbmStaffel(tx, standard.id!));
    expect((await loadEbmStaffeln(db)).map((s) => s.id)).toEqual([id]);
    await expect(inTransaktion(db, (tx) => deleteEbmStaffel(tx, UNBEKANNT))).rejects.toBeInstanceOf(ValidationError);
  });
});
