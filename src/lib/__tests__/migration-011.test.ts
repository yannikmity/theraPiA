// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { Client } from "pg";
import { createTestDb, migrateBis, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";

describe.skipIf(!TEST_DATABASE_URL)(
  "Migration 011 (Gruppenbezug einer Gruppensupervision)",
  () => {
    let cleanup: (() => Promise<void>) | undefined;
    afterEach(async () => {
      await cleanup?.();
      cleanup = undefined;
    });

    const one = async (client: Client, sql: string, params: unknown[] = []) =>
      (await client.query(sql, params)).rows[0];

    it("erlaubt eine Gruppe nur bei Gruppensupervisionen; Löschen der Gruppe lässt die Supervision stehen", async () => {
      const t = await createTestDb();
      cleanup = t.cleanup;
      const f = await seedOwnershipFixture(t.client);
      await expect(
        t.client.query(
          "UPDATE supervision_sessions SET group_id = $1 WHERE id = $2",
          [f.a.groupId, f.a.supervisionId],
        ),
      ).rejects.toThrow(/supervision_sessions_group_kind_check/);

      const sv = await one(
        t.client,
        `INSERT INTO supervision_sessions (user_id, supervisor_id, date, duration_minutes, kind, group_id)
       VALUES ($1, $2, '2026-01-20', 60, 'group', $3) RETURNING id`,
        [f.a.userId, f.a.supervisorId, f.a.groupId],
      );
      await t.client.query("DELETE FROM groups WHERE id = $1", [f.a.groupId]);
      expect(
        await one(
          t.client,
          "SELECT group_id, duration_minutes FROM supervision_sessions WHERE id = $1",
          [sv.id],
        ),
      ).toEqual({
        group_id: null,
        duration_minutes: 60,
      });
    });

    // Bestand mit Links auf mehrere Gruppen, ohne Links, falscher Art und fremdem Account. Je Supervision eigene
    // Doppelstunden, damit 010 nichts bereinigt und beide Wege dieselben Links sehen.
    const seedBestand = async (c: Client) => {
      const f = await seedOwnershipFixture(c);
      const userId = f.a.userId;
      const gruppe = async (name: string, start: string) =>
        (
          await one(
            c,
            "INSERT INTO groups (user_id, name, start_date, planned_session_count) VALUES ($1, $2, $3, 10) RETURNING id",
            [userId, name, start],
          )
        ).id as string;
      const doppelstunde = async (groupId: string) =>
        (
          await one(
            c,
            "INSERT INTO group_sessions (user_id, group_id, date, status, child_count) VALUES ($1, $2, '2026-01-05', 'durchgefuehrt', 6) RETURNING id",
            [userId, groupId],
          )
        ).id as string;
      const supervision = async (sessions: string[], kind = "group") => {
        const sv = await one(
          c,
          `INSERT INTO supervision_sessions (user_id, supervisor_id, date, duration_minutes, kind)
         VALUES ($1, $2, '2026-01-20', 60, $3) RETURNING id`,
          [userId, f.a.supervisorId, kind],
        );
        for (const s of sessions) {
          await c.query(
            "INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2)",
            [sv.id, s],
          );
        }
        return sv.id as string;
      };

      const fruehe = await gruppe("Früh", "2025-09-01");
      const spaete = await gruppe("Spät", "2026-01-01");
      const [f1, f2, f3, f4] = [
        await doppelstunde(fruehe),
        await doppelstunde(fruehe),
        await doppelstunde(fruehe),
        await doppelstunde(fruehe),
      ];
      const [s1, s2, s3] = [
        await doppelstunde(spaete),
        await doppelstunde(spaete),
        await doppelstunde(spaete),
      ];

      const erwartet = new Map<string, string | null>([
        [await supervision([f1]), fruehe],
        // Zwei Links in „Spät“, einer in „Früh“: die meisten Links gewinnen
        [await supervision([f2, s1, s2]), spaete],
        // Gleichstand: die Gruppe mit dem früheren Beginn
        [await supervision([s3, f3]), fruehe],
        [await supervision([]), null],
        // Falsche Art (nur über direktes SQL möglich): Einzelsupervisionen bekommen keine Gruppe
        [await supervision([f4], "individual"), null],
        // Link auf eine Doppelstunde eines anderen Accounts (nur über direktes SQL möglich) zählt nicht
        [await supervision([f.b.groupSessionId]), null],
        [f.a.supervisionId, null],
      ]);
      return erwartet;
    };

    const spalten =
      "id, supervisor_id, to_char(date, 'YYYY-MM-DD') AS date, duration_minutes, kind, setting";
    const ohneGruppe = async (c: Client) =>
      (await c.query(`SELECT ${spalten} FROM supervision_sessions ORDER BY id`)).rows;
    const gruppenbezug = async (c: Client) =>
      new Map<string, string | null>(
        (await c.query("SELECT id, group_id FROM supervision_sessions")).rows.map((r) => [r.id, r.group_id]),
      );
    const schemaVorhanden = async (c: Client) =>
      one(
        c,
        `SELECT
           EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'supervision_sessions_group_kind_check'
                     AND conrelid = 'supervision_sessions'::regclass) AS "check",
           to_regclass('idx_supervision_sessions_group_id') IS NOT NULL AS index`,
      );
    const erwarteBezug = async (c: Client, erwartet: Map<string, string | null>) => {
      const ist = await gruppenbezug(c);
      for (const [id, gruppe] of erwartet) expect(ist.get(id)).toBe(gruppe);
    };

    it("befüllt die Gruppe beim Upgrade ab Stand 009 schon in 010; 011 ändert danach nichts", async () => {
      const t = await createTestDb({ migrate: false });
      cleanup = t.cleanup;
      const c = t.client;
      await migrateBis(c, "009_supervision_cases.sql");
      const erwartet = await seedBestand(c);
      const vorher = await ohneGruppe(c);

      await migrateBis(c, "010_supervision_links_unique.sql");
      await erwarteBezug(c, erwartet);
      const nach010 = await gruppenbezug(c);

      expect(await migrateBis(c, "011_supervision_group.sql")).toEqual(["011_supervision_group.sql"]);
      expect(await gruppenbezug(c)).toEqual(nach010);
      expect(await ohneGruppe(c)).toEqual(vorher);
      expect(await schemaVorhanden(c)).toEqual({ check: true, index: true });
    });

    it("holt Spalte und Befüllung nach, wenn 010 noch ohne Gruppenbezug angewendet wurde", async () => {
      const t = await createTestDb({ migrate: false });
      cleanup = t.cleanup;
      const c = t.client;
      await migrateBis(c, "010_supervision_links_unique.sql");
      // Stand des früheren 010: ohne Spalte (Constraint und Index fallen mit ihr weg)
      await c.query("ALTER TABLE supervision_sessions DROP COLUMN group_id");
      expect(await schemaVorhanden(c)).toEqual({ check: false, index: false });
      const erwartet = await seedBestand(c);
      const vorher = await ohneGruppe(c);

      expect(await migrateBis(c, "011_supervision_group.sql")).toEqual(["011_supervision_group.sql"]);
      await erwarteBezug(c, erwartet);
      expect(await ohneGruppe(c)).toEqual(vorher);
      expect(await schemaVorhanden(c)).toEqual({ check: true, index: true });
    });
  },
);
