// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Client } from "pg";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { LOCK_ID, runMigrations } from "../../../scripts/migrate.mjs";
import { createTestDb, TEST_DATABASE_URL, MIGRATIONS_DIR } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";
import { tmpdir } from "node:os";

const state = vi.hoisted(() => ({ client: undefined as Client | undefined, userId: "" }));

vi.mock("../db", () => ({
  query: (text: string, params?: unknown[]) => state.client!.query(text, params),
}));
vi.mock("../db/get-current-user", () => ({ getCurrentUserId: async () => state.userId }));

import { getFinancialSettings } from "../db/financial-settings";

describe.skipIf(!TEST_DATABASE_URL)("runMigrations", () => {
  let cleanup: (() => Promise<void>) | undefined;
  const tempDirs: string[] = [];
  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    state.client = undefined;
    while (tempDirs.length > 0) await rm(tempDirs.pop()!, { recursive: true, force: true });
  });

  it("wendet alle Migrationen genau einmal an", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;

    const first = await runMigrations(t.client, MIGRATIONS_DIR);
    expect(first[0]).toBe("001_initial_schema.sql");
    expect(first).toContain("002_group_therapy_categories.sql");
    expect(first.at(-1)).toBe("010_supervision_links_unique.sql");

    const second = await runMigrations(t.client, MIGRATIONS_DIR);
    expect(second).toEqual([]);
  });

  it("übernimmt Datenbanken aus dem alten initdb-Setup: 001/002 als erledigt eingetragen, Rest angewendet", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    for (const file of ["001_initial_schema.sql", "002_group_therapy_categories.sql"]) {
      await t.client.query(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
    }

    const applied = await runMigrations(t.client, MIGRATIONS_DIR);
    expect(applied).toEqual(["003_accounts_and_invitations.sql", "004_planned_sessions_per_week.sql", "005_ausbildungsregeln.sql", "006_demo_accounts.sql", "007_sprechstunde_kontingente.sql", "008_supervision_setting.sql", "009_supervision_cases.sql", "010_supervision_links_unique.sql"]);
    const done = await t.client.query("SELECT name FROM schema_migrations ORDER BY name");
    expect(done.rows.map((r) => r.name)).toEqual([
      "001_initial_schema.sql",
      "002_group_therapy_categories.sql",
      "003_accounts_and_invitations.sql",
      "004_planned_sessions_per_week.sql",
      "005_ausbildungsregeln.sql",
      "006_demo_accounts.sql",
      "007_sprechstunde_kontingente.sql",
      "008_supervision_setting.sql",
      "009_supervision_cases.sql",
      "010_supervision_links_unique.sql",
    ]);
  });

  it("erkennt eine Datenbank mit nur 001 (ohne antragsdatum) und wendet 002 an, ohne 001 zu wiederholen", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    await t.client.query(await readFile(path.join(MIGRATIONS_DIR, "001_initial_schema.sql"), "utf8"));

    const applied = await runMigrations(t.client, MIGRATIONS_DIR);
    expect(applied).toEqual([
      "002_group_therapy_categories.sql",
      "003_accounts_and_invitations.sql",
      "004_planned_sessions_per_week.sql",
      "005_ausbildungsregeln.sql",
      "006_demo_accounts.sql",
      "007_sprechstunde_kontingente.sql",
      "008_supervision_setting.sql",
      "009_supervision_cases.sql",
      "010_supervision_links_unique.sql",
    ]);
    const done = await t.client.query("SELECT name FROM schema_migrations ORDER BY name");
    expect(done.rows.map((r) => r.name)).toContain("001_initial_schema.sql");
    const column = await t.client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'patients' AND column_name = 'antragsdatum'"
    );
    expect(column.rows).toHaveLength(1);
  });

  it("rollt eine fehlerhafte Migration zurück und meldet den Dateinamen", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    const dir = await tempDir("therapia-mig-");
    await writeFile(path.join(dir, "001_ok.sql"), "CREATE TABLE ok_table (id INT);");
    await writeFile(path.join(dir, "002_kaputt.sql"), "CREATE TABLE halb (id INT); SELECT * FROM gibt_es_nicht;");

    await expect(runMigrations(t.client, dir)).rejects.toThrow("002_kaputt.sql");
    const halb = await t.client.query("SELECT to_regclass('halb') IS NOT NULL AS present");
    expect(halb.rows[0].present).toBe(false);
    const done = await t.client.query("SELECT name FROM schema_migrations");
    expect(done.rows.map((r) => r.name)).toEqual(["001_ok.sql"]);
  });

  it("004 läuft auf einer befüllten Datenbank rein additiv: Bestandsdaten bleiben, neue Spalte NULL", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    const oldDir = await tempDir("therapia-mig-alt-");
    const oldFiles = ["001_initial_schema.sql", "002_group_therapy_categories.sql", "003_accounts_and_invitations.sql"];
    for (const file of oldFiles) await copyFile(path.join(MIGRATIONS_DIR, file), path.join(oldDir, file));
    expect(await runMigrations(t.client, oldDir)).toEqual(oldFiles);

    // Bestand wie im Pilot: Accounts mit Patient:innen, Sitzungen, Supervision, Finanzeinstellungen.
    const f = await seedOwnershipFixture(t.client);
    await t.client.query("UPDATE supervisors SET cost_per_hour = 112.5 WHERE id = $1", [f.a.supervisorId]);
    await t.client.query("INSERT INTO financial_settings (user_id, income_per_hour) VALUES ($1, 80.25), ($2, 95)", [
      f.a.userId,
      f.b.userId,
    ]);
    const tables = [
      "users",
      "patients",
      "therapy_sessions",
      "supervisors",
      "supervision_sessions",
      "supervision_therapy_links",
      "groups",
      "group_sessions",
      "financial_settings",
    ];
    const snapshot = async () => {
      const out: Record<string, unknown[]> = {};
      for (const table of tables) {
        const { rows } = await t.client.query(`SELECT * FROM ${table} ORDER BY 1, 2`);
        out[table] = rows.map(
          ({ planned_sessions_per_week: _neu, is_demo: _demo, genehmigungsdatum: _gen, sprechstunden_ambulanz: _amb, setting: _setting, ...rest }) => rest
        );
      }
      return out;
    };
    const before = await snapshot();

    const applied = await runMigrations(t.client, MIGRATIONS_DIR);
    expect(applied).toEqual(["004_planned_sessions_per_week.sql", "005_ausbildungsregeln.sql", "006_demo_accounts.sql", "007_sprechstunde_kontingente.sql", "008_supervision_setting.sql", "009_supervision_cases.sql", "010_supervision_links_unique.sql"]);

    expect(await snapshot()).toEqual(before);
    const { rows } = await t.client.query("SELECT planned_sessions_per_week FROM financial_settings");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.planned_sessions_per_week === null)).toBe(true);

    state.client = t.client;
    state.userId = f.a.userId;
    expect(await getFinancialSettings()).toEqual({
      incomePerHour: 80.25,
      supervisionCosts: { [f.a.supervisorId]: 112.5 },
      plannedSessionsPerWeek: null,
    });
  });

  // Fake-Client ohne Datenbank: beantwortet die Abfragen des Runners minimal, scheitert wo `fails` es sagt.
  function fakeClient(fails: (sql: string) => boolean) {
    return {
      query: vi.fn(async (sql: string) => {
        if (fails(sql)) throw new Error(`${sql.slice(0, 30)} fehlgeschlagen`);
        if (sql.startsWith("SELECT count(*)")) return { rows: [{ n: 0 }] };
        if (sql.startsWith("SELECT to_regclass")) return { rows: [{ present: false }] };
        return { rows: [] };
      }),
    };
  }

  it("verdeckt den Fehler einer Migration nicht, wenn auch pg_advisory_unlock scheitert", async () => {
    const dir = await tempDir("therapia-mig-unlock-");
    await writeFile(path.join(dir, "001_kaputt.sql"), "SELECT * FROM gibt_es_nicht;");
    const client = fakeClient((sql) => sql.includes("gibt_es_nicht") || sql.includes("pg_advisory_unlock"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(runMigrations(client, dir)).rejects.toThrow("Migration 001_kaputt.sql fehlgeschlagen");
      expect(error).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_unlock"));
    } finally {
      error.mockRestore();
    }
  });

  it("wirft den Unlock-Fehler, wenn die Migrationen selbst durchgelaufen sind", async () => {
    const dir = await tempDir("therapia-mig-unlock-ok-");
    const client = fakeClient((sql) => sql.includes("pg_advisory_unlock"));
    await expect(runMigrations(client, dir)).rejects.toThrow("pg_advisory_unlock");
  });
  it("nimmt mit eigener lockId diese Sperre statt der gemeinsamen", async () => {
    const dir = await tempDir("therapia-mig-lock-");
    const own = fakeClient(() => false);
    await runMigrations(own, dir, { lockId: 42 });
    expect(own.query).toHaveBeenCalledWith("SELECT pg_advisory_lock($1)", [42]);
    expect(own.query).toHaveBeenCalledWith("SELECT pg_advisory_unlock($1)", [42]);
    const shared = fakeClient(() => false);
    await runMigrations(shared, dir);
    expect(LOCK_ID).toBe(7274201);
    expect(shared.query).toHaveBeenCalledWith("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  });

  // Unter Last warteten Test-Dateien (und Testläufe anderer Checkouts) auf die eine Sperre je Datenbank und liefen in
  // den 5-s-Timeout (#57). Test-Schemas sind privat – createTestDb darf nicht auf die gemeinsame Sperre warten.
  it("createTestDb wartet nicht auf die gemeinsame Migrationssperre", async () => {
    const holder = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await holder.connect();
    let created: ReturnType<typeof createTestDb> | undefined;
    try {
      await holder.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
      created = createTestDb();
      const outcome = await Promise.race([
        created.then(() => "fertig"),
        new Promise<string>((resolve) => setTimeout(() => resolve("wartet auf die gemeinsame Sperre"), 10_000)),
      ]);
      expect(outcome).toBe("fertig");
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
      await holder.end();
      if (created) cleanup = (await created).cleanup;
    }
  }, 20_000);
});
