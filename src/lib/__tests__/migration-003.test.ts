// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runMigrations } from "../../../scripts/migrate.mjs";
import { createTestDb, TEST_DATABASE_URL, MIGRATIONS_DIR } from "./helpers/test-db";

describe.skipIf(!TEST_DATABASE_URL)("Migration 003", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("löscht beim Entfernen eines Accounts alle zugehörigen Daten", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const user = await t.client.query(
      "INSERT INTO users (email, password_hash, name) VALUES ('pia@example.com', 'x', 'Test') RETURNING id, role, session_version"
    );
    const userId = user.rows[0].id;
    expect(user.rows[0].role).toBe("pia");
    expect(user.rows[0].session_version).toBe(0);

    const patient = await t.client.query(
      "INSERT INTO patients (user_id, chiffre, therapy_type, start_date) VALUES ($1, 'A-01', 'kurzzeittherapie', '2026-01-01') RETURNING id",
      [userId]
    );
    await t.client.query(
      "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-02', 50)",
      [userId, patient.rows[0].id]
    );
    // Zeilen ohne weitere Fremdschlüssel: Sie verschwinden nur über den Fremdschlüssel auf users.
    await t.client.query("INSERT INTO financial_settings (user_id, income_per_hour) VALUES ($1, 40)", [userId]);
    await t.client.query("INSERT INTO supervisors (user_id, name) VALUES ($1, 'Supervision A')", [userId]);

    await t.client.query("DELETE FROM users WHERE id = $1", [userId]);
    const left = await t.client.query(
      `SELECT (SELECT count(*)::int FROM therapy_sessions) AS sessions,
              (SELECT count(*)::int FROM financial_settings) AS finances,
              (SELECT count(*)::int FROM supervisors) AS supervisors`
    );
    expect(left.rows[0]).toEqual({ sessions: 0, finances: 0, supervisors: 0 });
  });

  it("überführt eine Datenbank mit Stand 001+002 (Upgrade-Pfad)", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    for (const file of ["001_initial_schema.sql", "002_group_therapy_categories.sql"]) {
      await t.client.query(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
    }
    const older = await t.client.query(
      "INSERT INTO users (email, password_hash, name, created_at) VALUES ('  Alt@Example.COM ', 'x', 'Alt', '2025-01-01') RETURNING id"
    );
    const younger = await t.client.query(
      "INSERT INTO users (email, password_hash, name, created_at) VALUES ('neu@example.com', 'x', 'Neu', '2026-01-01') RETURNING id"
    );
    await t.client.query(
      "INSERT INTO patients (user_id, chiffre, therapy_type, start_date) VALUES (gen_random_uuid(), 'X-99', 'kurzzeittherapie', '2026-01-01')"
    );
    await t.client.query("INSERT INTO financial_settings (user_id, income_per_hour) VALUES ($1, 40)", [
      younger.rows[0].id,
    ]);

    const applied = await runMigrations(t.client, MIGRATIONS_DIR);
    expect(applied).toContain("003_accounts_and_invitations.sql");

    const users = await t.client.query("SELECT id, email, role FROM users ORDER BY created_at");
    expect(users.rows).toEqual([
      { id: older.rows[0].id, email: "alt@example.com", role: "admin" },
      { id: younger.rows[0].id, email: "neu@example.com", role: "pia" },
    ]);
    const orphans = await t.client.query("SELECT count(*)::int AS n FROM patients");
    expect(orphans.rows[0].n).toBe(0);
    const finances = await t.client.query("SELECT count(*)::int AS n FROM financial_settings");
    expect(finances.rows[0].n).toBe(1);
    const fk = await t.client.query(
      "SELECT 1 FROM pg_constraint WHERE conname = 'patients_user_fk' AND conrelid = 'patients'::regclass"
    );
    expect(fk.rows).toHaveLength(1);
    const accounts = await t.client.query("SELECT to_regclass('accounts') AS a");
    expect(accounts.rows[0].a).toBeNull();
  });

  it("entfernt die ungenutzten NextAuth-Adapter-Tabellen", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const r = await t.client.query(
      "SELECT to_regclass('accounts') AS a, to_regclass('sessions') AS s, to_regclass('verification_tokens') AS v"
    );
    expect(r.rows[0]).toEqual({ a: null, s: null, v: null });
  });
});
