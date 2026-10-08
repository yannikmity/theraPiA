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

    it("befüllt die Gruppe aus Bestandsdaten (Stand 010): Gruppe der Links, bei mehreren die mit den meisten", async () => {
      const t = await createTestDb({ migrate: false });
      cleanup = t.cleanup;
      const c = t.client;
      await migrateBis(c, "010_supervision_links_unique.sql");
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
      // Seit 010 gehört jede Doppelstunde zu höchstens einer Supervision – deshalb je Supervision eigene.
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

      const eine = await supervision([f1]);
      // Zwei Links in „Spät“, einer in „Früh“: die meisten Links gewinnen
      const mehrheit = await supervision([f2, s1, s2]);
      // Gleichstand: die Gruppe mit dem früheren Beginn
      const gleichstand = await supervision([s3, f3]);
      const ohneLinks = await supervision([]);
      // Falsche Art (nur über direktes SQL möglich): Einzelsupervisionen bekommen keine Gruppe
      const einzel = await supervision([f4], "individual");
      // Link auf eine Doppelstunde eines anderen Accounts (nur über direktes SQL möglich) zählt nicht
      const fremd = await supervision([f.b.groupSessionId]);

      const spalten =
        "id, supervisor_id, to_char(date, 'YYYY-MM-DD') AS date, duration_minutes, kind, setting";
      const vorher = await c.query(
        `SELECT ${spalten} FROM supervision_sessions ORDER BY id`,
      );
      expect(await migrateBis(c, "011_supervision_group.sql")).toEqual([
        "011_supervision_group.sql",
      ]);
      expect(
        (
          await c.query(
            `SELECT ${spalten} FROM supervision_sessions ORDER BY id`,
          )
        ).rows,
      ).toEqual(vorher.rows);

      const gruppeVon = async (id: string) =>
        (
          await one(
            c,
            "SELECT group_id FROM supervision_sessions WHERE id = $1",
            [id],
          )
        ).group_id;
      expect(await gruppeVon(eine)).toBe(fruehe);
      expect(await gruppeVon(mehrheit)).toBe(spaete);
      expect(await gruppeVon(gleichstand)).toBe(fruehe);
      expect(await gruppeVon(ohneLinks)).toBeNull();
      expect(await gruppeVon(einzel)).toBeNull();
      expect(await gruppeVon(fremd)).toBeNull();
      expect(await gruppeVon(f.a.supervisionId)).toBeNull();
    });
  },
);
