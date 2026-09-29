// @vitest-environment node
// Rechte der Pflege-Actions (#8): Instanzprofil und EBM-Staffel nur Admins, persönliche Abweichungen nur der eigene
// Account. Die Actions laufen echt gegen die Test-Datenbank; nur Sitzung und Verbindung sind umgebogen.
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";
import { MELDUNG_KRITISCH, MELDUNG_PAAR } from "../ausbildungsregeln/validation";
import { KEINE_ABWEICHUNGEN } from "../ausbildungsregeln/model";

const state = vi.hoisted(() => ({
  client: undefined as Client | undefined,
  userId: "",
  role: "pia" as "pia" | "admin",
}));

vi.mock("../auth", () => ({ auth: async () => ({ user: { id: state.userId, role: state.role }, expires: "" }) }));
vi.mock("../db", () => {
  const query = (text: string, params?: unknown[]) => state.client!.query(text, params);
  return {
    db: { query },
    query,
    withTransaction: async <T,>(fn: (tx: Client) => Promise<T>): Promise<T> => {
      const client = state.client!;
      await client.query("BEGIN");
      try {
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    },
  };
});

import { resetAusbildungsprofilAction, saveAusbildungsprofilAction } from "@/app/(app)/admin/ausbildungsprofil/actions";
import { deleteEbmStaffelAction, saveEbmStaffelAction } from "@/app/(app)/admin/ebm-staffel/actions";
import { resetAbweichungenAction, saveAbweichungenAction } from "@/app/(app)/profile/regeln/actions";
import { MELDUNG_DATUM_VERGEBEN, MELDUNG_LETZTE_STAFFEL } from "../services/ausbildungsregeln";

const PROFIL = {
  behandlungsstundenZiel: 500,
  svEinheitenZiel: 125,
  verhaeltnisWarnung: 3.5,
  verhaeltnisKritisch: 4.5,
  gruppeDoppelstundenZiel: 50,
  gruppeAmbulanzzeitZiel: 30,
};
const KEINE_BERECHTIGUNG = { success: false, error: "Keine Berechtigung" };

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  state.client = undefined;
});

async function setup(role: "pia" | "admin") {
  const t = await createTestDb();
  cleanup = t.cleanup;
  const f = await seedOwnershipFixture(t.client);
  state.client = t.client;
  state.userId = f.a.userId;
  state.role = role;
  return { db: t.client, f };
}

describe.skipIf(!TEST_DATABASE_URL)("Rechte: Ausbildungsprofil (#8)", () => {
  it("PiA darf das Profil weder speichern noch zurücksetzen – nichts ändert sich", async () => {
    const { db } = await setup("pia");
    expect(await saveAusbildungsprofilAction(PROFIL)).toMatchObject(KEINE_BERECHTIGUNG);
    expect(await resetAusbildungsprofilAction({})).toMatchObject(KEINE_BERECHTIGUNG);
    expect((await db.query("SELECT behandlungsstunden_ziel FROM ausbildungsprofil")).rows).toEqual([{ behandlungsstunden_ziel: 600 }]);
  });

  it("Admin speichert und setzt zurück; ungültige Werte kommen als Feldfehler zurück", async () => {
    await setup("admin");
    expect(await saveAusbildungsprofilAction(PROFIL)).toMatchObject({ success: true, data: { regeln: PROFIL, quelle: "instanz" } });
    expect(await saveAusbildungsprofilAction({ ...PROFIL, verhaeltnisKritisch: 3 })).toMatchObject({
      success: false,
      fieldErrors: { verhaeltnisKritisch: [MELDUNG_KRITISCH] },
    });
    expect(await resetAusbildungsprofilAction({})).toMatchObject({ success: true, data: { quelle: "standard" } });
  });
});

const STUFEN = [
  { kinderzahl: 3, total: 180, share: 90 },
  { kinderzahl: 4, total: 205, share: 102.5 },
];

describe.skipIf(!TEST_DATABASE_URL)("Rechte: EBM-Staffel (#8)", () => {
  it("PiA darf Staffeln weder anlegen noch löschen", async () => {
    const { db } = await setup("pia");
    const [{ id }] = (await db.query("SELECT id FROM ebm_staffeln")).rows;
    expect(await saveEbmStaffelAction({ id: null, gueltigAb: "2027-01-01", stufen: STUFEN })).toMatchObject(KEINE_BERECHTIGUNG);
    expect(await deleteEbmStaffelAction({ id })).toMatchObject(KEINE_BERECHTIGUNG);
    expect((await db.query("SELECT count(*)::int AS n FROM ebm_staffeln")).rows[0].n).toBe(1);
  });

  it("Admin legt an, meldet vergebene Daten am Feld, löscht, aber nie die letzte Staffel", async () => {
    const { db } = await setup("admin");
    const [{ id: standardId }] = (await db.query("SELECT id FROM ebm_staffeln")).rows;
    const angelegt = await saveEbmStaffelAction({ id: null, gueltigAb: "2027-01-01", stufen: STUFEN });
    expect(angelegt).toMatchObject({ success: true });
    expect(angelegt.success && angelegt.data.map((s) => s.gueltigAb)).toEqual(["2000-01-01", "2027-01-01"]);
    expect(await saveEbmStaffelAction({ id: null, gueltigAb: "2027-01-01", stufen: STUFEN })).toMatchObject({
      success: false,
      error: MELDUNG_DATUM_VERGEBEN,
      fieldErrors: { gueltigAb: [MELDUNG_DATUM_VERGEBEN] },
    });
    expect(await deleteEbmStaffelAction({ id: "550e8400-e29b-41d4-a716-446655440099" })).toMatchObject({
      success: false,
      error: "EBM-Staffel nicht gefunden",
    });
    const geloescht = await deleteEbmStaffelAction({ id: standardId });
    expect(geloescht.success && geloescht.data.map((s) => s.gueltigAb)).toEqual(["2027-01-01"]);
    const [{ id: letzteId }] = (await db.query("SELECT id FROM ebm_staffeln")).rows;
    expect(await deleteEbmStaffelAction({ id: letzteId })).toMatchObject({ success: false, error: MELDUNG_LETZTE_STAFFEL });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("Rechte: persönliche Abweichungen (#8)", () => {
  const zeilen = async (db: Client) =>
    (await db.query("SELECT user_id, behandlungsstunden_ziel FROM ausbildungsregeln_abweichungen ORDER BY behandlungsstunden_ziel")).rows;

  it("speichert nur für den angemeldeten Account – eine mitgeschickte fremde User-ID bleibt wirkungslos", async () => {
    const { db, f } = await setup("pia");
    const r = await saveAbweichungenAction({ ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450, userId: f.b.userId } as never);
    expect(r).toMatchObject({ success: true, data: { regeln: { behandlungsstundenZiel: 450 }, abweichend: ["behandlungsstundenZiel"] } });
    expect(await zeilen(db)).toEqual([{ user_id: f.a.userId, behandlungsstunden_ziel: 450 }]);
  });

  it("Zurücksetzen betrifft nur den eigenen Account", async () => {
    const { db, f } = await setup("pia");
    await db.query(
      "INSERT INTO ausbildungsregeln_abweichungen (user_id, behandlungsstunden_ziel) VALUES ($1, 450), ($2, 500)",
      [f.a.userId, f.b.userId]
    );
    expect(await resetAbweichungenAction({})).toMatchObject({ success: true, data: { abweichend: [] } });
    expect(await zeilen(db)).toEqual([{ user_id: f.b.userId, behandlungsstunden_ziel: 500 }]);
  });

  it("lehnt halbe Paare mit Feldfehler ab und schreibt nichts", async () => {
    const { db } = await setup("pia");
    expect(await saveAbweichungenAction({ ...KEINE_ABWEICHUNGEN, verhaeltnisWarnung: 3 })).toMatchObject({
      success: false,
      fieldErrors: { verhaeltnisKritisch: [MELDUNG_PAAR] },
    });
    expect(await zeilen(db)).toEqual([]);
  });

  it("ohne Anmeldung passiert nichts", async () => {
    const { db } = await setup("pia");
    state.userId = "";
    expect(await saveAbweichungenAction({ ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 })).toMatchObject({
      success: false,
      error: "Nicht angemeldet",
    });
    expect(await zeilen(db)).toEqual([]);
  });
});
