// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { Client } from "pg";
import { createTestDb, migrateBis, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";

// Alle Tabellen bei Stand 004 außer schema_migrations. accounts, sessions und verification_tokens aus 001
// entfernt Migration 003 wieder; der Test unten prüft die Liste gegen die Datenbank, damit keine Tabelle fehlt.
const BESTEHENDE_TABELLEN = [
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
];

async function inhalt(client: Client): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const tabelle of BESTEHENDE_TABELLEN) {
    out[tabelle] = (await client.query(`SELECT * FROM ${tabelle} ORDER BY 1, 2`)).rows;
  }
  return out;
}

const pgFehler = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ code });

describe.skipIf(!TEST_DATABASE_URL)("Migration 005 (Ausbildungsregeln)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("legt Profil und EBM-Staffel mit den bisherigen Werten an", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const profil = await t.client.query(
      `SELECT behandlungsstunden_ziel, sv_einheiten_ziel, verhaeltnis_warnung, verhaeltnis_kritisch,
              gruppe_doppelstunden_ziel, gruppe_ambulanzzeit_ziel FROM ausbildungsprofil`
    );
    expect(profil.rows).toEqual([
      {
        behandlungsstunden_ziel: 600,
        sv_einheiten_ziel: 150,
        verhaeltnis_warnung: 4,
        verhaeltnis_kritisch: 5,
        gruppe_doppelstunden_ziel: 60,
        gruppe_ambulanzzeit_ziel: 40,
      },
    ]);
    const staffeln = await t.client.query("SELECT gueltig_ab FROM ebm_staffeln");
    expect(staffeln.rows).toEqual([{ gueltig_ab: "2000-01-01" }]);
    const stufen = await t.client.query(
      "SELECT kinderzahl, honorar_gesamt, honorar_anteil FROM ebm_staffel_stufen ORDER BY kinderzahl"
    );
    expect(stufen.rows.map((r) => [r.kinderzahl, r.honorar_gesamt, r.honorar_anteil])).toEqual([
      [3, 177, 88.5],
      [4, 200, 100],
      [5, 225, 112.5],
      [6, 243, 121.5],
      [7, 266, 133],
      [8, 288, 144],
      [9, 301.5, 150.75],
    ]);
    expect((await t.client.query("SELECT count(*)::int AS n FROM ausbildungsregeln_abweichungen")).rows[0].n).toBe(0);
  });

  it("Update von Stand 004: bestehende Daten bleiben unverändert, nur neue Tabellen kommen hinzu", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    expect((await migrateBis(t.client, "004_planned_sessions_per_week.sql")).at(-1)).toBe("004_planned_sessions_per_week.sql");
    const tabellen = await t.client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name <> 'schema_migrations'"
    );
    expect(tabellen.rows.map((r) => r.table_name).sort()).toEqual([...BESTEHENDE_TABELLEN].sort());
    const f = await seedOwnershipFixture(t.client);
    await t.client.query(
      "INSERT INTO financial_settings (user_id, income_per_hour, planned_sessions_per_week) VALUES ($1, 85, 6), ($2, 90, NULL)",
      [f.a.userId, f.b.userId]
    );
    await t.client.query("INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2)", [
      f.a.supervisionId,
      f.a.groupSessionId,
    ]);
    await t.client.query(
      "INSERT INTO invitations (token_hash, email, created_by, expires_at) VALUES (repeat('a', 64), 'neu@example.com', $1, '2026-12-31')",
      [f.a.userId]
    );
    await t.client.query("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (repeat('b', 64), $1, '2026-12-31')", [
      f.b.userId,
    ]);
    const vorher = await inhalt(t.client);
    expect(BESTEHENDE_TABELLEN.filter((tabelle) => vorher[tabelle].length === 0)).toEqual([]);

    expect(await migrateBis(t.client, "005_ausbildungsregeln.sql")).toEqual(["005_ausbildungsregeln.sql"]);

    expect(await inhalt(t.client)).toEqual(vorher);
    expect((await t.client.query("SELECT count(*)::int AS n FROM ausbildungsprofil")).rows[0].n).toBe(1);
  });

  it("erzwingt die Regeln des Profils: genau eine Zeile, Wertebereiche, kritisch > Soll, Ambulanzzeit ≤ Doppelstunden", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const zeile = (id: boolean) =>
      t.client.query(
        `INSERT INTO ausbildungsprofil (id, behandlungsstunden_ziel, sv_einheiten_ziel, verhaeltnis_warnung, verhaeltnis_kritisch,
           gruppe_doppelstunden_ziel, gruppe_ambulanzzeit_ziel) VALUES ($1, 600, 150, 4, 5, 60, 40)`,
        [id]
      );
    await pgFehler(zeile(true), "23505");
    await pgFehler(zeile(false), "23514");
    await pgFehler(t.client.query("UPDATE ausbildungsprofil SET verhaeltnis_kritisch = 4"), "23514");
    await pgFehler(t.client.query("UPDATE ausbildungsprofil SET gruppe_ambulanzzeit_ziel = 61"), "23514");
    await pgFehler(t.client.query("UPDATE ausbildungsprofil SET behandlungsstunden_ziel = 0"), "23514");
    // NUMERIC(3,1) rundet still auf eine Nachkommastelle – die App lässt zwei Stellen gar nicht durch (Zod, Task 3).
    await t.client.query("UPDATE ausbildungsprofil SET verhaeltnis_warnung = 3.55");
    expect((await t.client.query("SELECT verhaeltnis_warnung FROM ausbildungsprofil")).rows[0].verhaeltnis_warnung).toBe(3.6);
  });

  it("erzwingt bei Abweichungen Paare und Reihenfolge; einzelne Ziele sind erlaubt", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    const abw = (spalten: string, werte: unknown[]) =>
      t.client.query(`INSERT INTO ausbildungsregeln_abweichungen (user_id, ${spalten}) VALUES ($1, ${werte.map((_, i) => `$${i + 2}`).join(", ")})`, [
        f.a.userId,
        ...werte,
      ]);
    await pgFehler(abw("verhaeltnis_warnung", [3]), "23514");
    await pgFehler(abw("verhaeltnis_warnung, verhaeltnis_kritisch", [3, 3]), "23514");
    await pgFehler(abw("gruppe_doppelstunden_ziel, gruppe_ambulanzzeit_ziel", [30, 31]), "23514");
    await abw("behandlungsstunden_ziel, verhaeltnis_warnung, verhaeltnis_kritisch", [450, 3.5, 4.5]);
    await pgFehler(abw("sv_einheiten_ziel", [100]), "23505");
  });

  it("erzwingt eindeutige Gültigkeitsbeginne und gültige Stufen", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    await pgFehler(t.client.query("INSERT INTO ebm_staffeln (gueltig_ab) VALUES ('2000-01-01')"), "23505");
    const neu = (await t.client.query("INSERT INTO ebm_staffeln (gueltig_ab) VALUES ('2027-01-01') RETURNING id")).rows[0].id;
    const stufe = (kinderzahl: number, gesamt: number, anteil: number) =>
      t.client.query("INSERT INTO ebm_staffel_stufen (staffel_id, kinderzahl, honorar_gesamt, honorar_anteil) VALUES ($1, $2, $3, $4)", [
        neu,
        kinderzahl,
        gesamt,
        anteil,
      ]);
    await stufe(3, 180, 90);
    await pgFehler(stufe(3, 180, 90), "23505");
    await pgFehler(stufe(4, 180, 181), "23514");
    await pgFehler(stufe(0, 180, 90), "23514");
  });

  it("löscht Abweichungen mit dem Account und Stufen mit der Staffel", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    await t.client.query("INSERT INTO ausbildungsregeln_abweichungen (user_id, behandlungsstunden_ziel) VALUES ($1, 500)", [f.a.userId]);
    await t.client.query("DELETE FROM users WHERE id = $1", [f.a.userId]);
    expect((await t.client.query("SELECT count(*)::int AS n FROM ausbildungsregeln_abweichungen")).rows[0].n).toBe(0);
    await t.client.query("DELETE FROM ebm_staffeln");
    expect((await t.client.query("SELECT count(*)::int AS n FROM ebm_staffel_stufen")).rows[0].n).toBe(0);
  });
});
