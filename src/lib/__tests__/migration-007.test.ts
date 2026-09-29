// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { runMigrations } from "../../../scripts/migrate.mjs";
import { createTestDb, migrateBis, MIGRATIONS_DIR, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";

describe.skipIf(!TEST_DATABASE_URL)("Migration 007 (Sprechstunde, Gesprächsziffer, Genehmigung)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("legt Genehmigungsdatum (NULL) und Sprechstunden der Ambulanzleitung (NOT NULL, 0) an", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const { rows } = await t.client.query(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'patients'
         AND column_name IN ('genehmigungsdatum', 'sprechstunden_ambulanz') ORDER BY column_name`
    );
    expect(rows).toEqual([
      { column_name: "genehmigungsdatum", data_type: "date", is_nullable: "YES", column_default: null },
      { column_name: "sprechstunden_ambulanz", data_type: "integer", is_nullable: "NO", column_default: "0" },
    ]);
  });

  it("nimmt die neuen Kategorien an, lehnt unbekannte ab und begrenzt die Ambulanz-Sprechstunden auf 0–10", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    for (const category of ["sprechstunde", "gespraechsziffer"]) {
      await t.client.query("UPDATE therapy_sessions SET category = $1 WHERE id = $2", [category, f.a.therapySessionId]);
    }
    await expect(
      t.client.query("UPDATE therapy_sessions SET category = 'unbekannt' WHERE id = $1", [f.a.therapySessionId])
    ).rejects.toThrow(/therapy_sessions_category_check/);
    await expect(
      t.client.query("UPDATE patients SET sprechstunden_ambulanz = 11 WHERE id = $1", [f.a.patientId])
    ).rejects.toThrow(/patients_sprechstunden_ambulanz_check/);
  });

  it("läuft auf einer befüllten Datenbank (Stand 006) rein additiv", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    await migrateBis(t.client, "006_demo_accounts.sql");
    const f = await seedOwnershipFixture(t.client);
    const vorher = await t.client.query("SELECT id, category FROM therapy_sessions ORDER BY id");
    await runMigrations(t.client, MIGRATIONS_DIR, { lockId: 7007 });
    const nachher = await t.client.query("SELECT id, category FROM therapy_sessions ORDER BY id");
    expect(nachher.rows).toEqual(vorher.rows);
    const p = await t.client.query("SELECT genehmigungsdatum, sprechstunden_ambulanz FROM patients WHERE id = $1", [f.a.patientId]);
    expect(p.rows[0]).toEqual({ genehmigungsdatum: null, sprechstunden_ambulanz: 0 });
  });
});
