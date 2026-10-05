// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { runMigrations } from "../../../scripts/migrate.mjs";
import { createTestDb, migrateBis, MIGRATIONS_DIR, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";

describe.skipIf(!TEST_DATABASE_URL)("Migration 008 (Setting der Supervision)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("legt das Setting als Pflichtspalte mit Vorgabe Einzel an und lehnt unbekannte Werte ab", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const { rows } = await t.client.query(
      `SELECT is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'supervision_sessions' AND column_name = 'setting'`
    );
    expect(rows).toEqual([{ is_nullable: "NO", column_default: "'einzel'::character varying" }]);
    const f = await seedOwnershipFixture(t.client);
    await t.client.query("UPDATE supervision_sessions SET setting = 'gruppe' WHERE id = $1", [f.a.supervisionId]);
    await expect(
      t.client.query("UPDATE supervision_sessions SET setting = 'unbekannt' WHERE id = $1", [f.a.supervisionId])
    ).rejects.toThrow(/supervision_sessions_setting_check/);
  });

  it("läuft auf einer befüllten Datenbank (Stand 007) rein additiv: bestehende Supervisionen gelten als Einzel", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    await migrateBis(t.client, "007_sprechstunde_kontingente.sql");
    const f = await seedOwnershipFixture(t.client);
    const spalten = "id, supervisor_id, to_char(date, 'YYYY-MM-DD') AS date, duration_minutes, kind";
    const vorher = await t.client.query(`SELECT ${spalten} FROM supervision_sessions ORDER BY id`);
    expect(await runMigrations(t.client, MIGRATIONS_DIR, { lockId: 7008 })).toEqual(["008_supervision_setting.sql"]);
    const nachher = await t.client.query(`SELECT ${spalten} FROM supervision_sessions ORDER BY id`);
    expect(nachher.rows).toEqual(vorher.rows);
    const sv = await t.client.query("SELECT setting FROM supervision_sessions WHERE id = $1", [f.a.supervisionId]);
    expect(sv.rows[0]).toEqual({ setting: "einzel" });
  });
});
