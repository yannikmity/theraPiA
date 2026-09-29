// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { Client } from "pg";
import { createTestDb, migrateBis, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";

// Alle Tabellen bei Stand 005 außer schema_migrations.
const TABELLEN = [
  "users",
  "invitations",
  "password_reset_tokens",
  "patients",
  "supervisors",
  "therapy_sessions",
  "supervision_sessions",
  "supervision_therapy_links",
  "supervision_group_session_links",
  "financial_settings",
  "groups",
  "group_sessions",
  "ausbildungsprofil",
  "ausbildungsregeln_abweichungen",
  "ebm_staffeln",
  "ebm_staffel_stufen",
];

// Inhalt aller Tabellen ohne die beiden neuen Spalten – vor und nach der Migration muss er gleich sein.
async function inhalt(client: Client): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const tabelle of TABELLEN) {
    const { rows } = await client.query(`SELECT * FROM ${tabelle} ORDER BY 1, 2`);
    out[tabelle] = rows.map(({ is_demo: _demo, with_demo_data: _mitDaten, ...rest }) => rest);
  }
  return out;
}

describe.skipIf(!TEST_DATABASE_URL)("Migration 006 (Demo-Accounts)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("legt die beiden Kennzeichen als NOT NULL mit Standard false an", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const { rows } = await t.client.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND ((table_name = 'invitations' AND column_name = 'with_demo_data') OR (table_name = 'users' AND column_name = 'is_demo'))
       ORDER BY table_name`
    );
    expect(rows).toEqual([
      { table_name: "invitations", column_name: "with_demo_data", data_type: "boolean", is_nullable: "NO", column_default: "false" },
      { table_name: "users", column_name: "is_demo", data_type: "boolean", is_nullable: "NO", column_default: "false" },
    ]);
  });

  it("läuft auf einer befüllten Datenbank (Stand 005) rein additiv: Bestand unverändert, Kennzeichen false", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    expect((await migrateBis(t.client, "005_ausbildungsregeln.sql")).at(-1)).toBe("005_ausbildungsregeln.sql");
    const f = await seedOwnershipFixture(t.client);
    await t.client.query(
      "INSERT INTO invitations (token_hash, email, created_by, expires_at) VALUES (repeat('a', 64), 'neu@example.com', $1, '2026-12-31')",
      [f.a.userId]
    );
    const vorher = await inhalt(t.client);

    expect(await migrateBis(t.client, "006_demo_accounts.sql")).toEqual(["006_demo_accounts.sql"]);

    expect(await inhalt(t.client)).toEqual(vorher);
    const demo = await t.client.query("SELECT DISTINCT is_demo FROM users");
    expect(demo.rows).toEqual([{ is_demo: false }]);
    const mitDaten = await t.client.query("SELECT DISTINCT with_demo_data FROM invitations");
    expect(mitDaten.rows).toEqual([{ with_demo_data: false }]);
  });
});
