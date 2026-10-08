// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { Client } from "pg";
import { createTestDb, migrateBis, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";

describe.skipIf(!TEST_DATABASE_URL)("Migration 010 (Sitzung höchstens einer Supervision zugeordnet)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  const one = async (client: Client, sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows[0];

  it("bereinigt doppelte Zuordnungen: eigener Account vor fremdem, dann die früheste Supervision; Dauer und Anteile bleiben", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    const c = t.client;
    await migrateBis(c, "009_supervision_cases.sql");
    const f = await seedOwnershipFixture(c);
    const userId = f.a.userId;
    const supervision = async (date: string, kind = "individual") =>
      (
        await one(
          c,
          `INSERT INTO supervision_sessions (user_id, supervisor_id, date, duration_minutes, kind)
           VALUES ($1, $2, $3, 50, $4) RETURNING id`,
          [userId, f.a.supervisorId, date, kind]
        )
      ).id as string;
    const link = (supervisionId: string, sessionId: string, createdAt: string) =>
      c.query("INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id, created_at) VALUES ($1, $2, $3)", [
        supervisionId,
        sessionId,
        createdAt,
      ]);
    const zweite = (
      await one(
        c,
        "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-02', 50) RETURNING id",
        [userId, f.a.patientId]
      )
    ).id as string;

    // Fixture-Supervision (04.01.) hat die Sitzung der Fixture. Eine spätere Supervision (20.01.) mit Anteil hat sie
    // doppelt – aus einem veralteten Tab – und zusätzlich eine eigene Sitzung.
    const spaeter = await supervision("2026-01-20");
    await link(spaeter, f.a.therapySessionId, "2026-01-01T10:00:00Z");
    await link(spaeter, zweite, "2026-01-01T10:00:00Z");
    await c.query("INSERT INTO supervision_cases (supervision_id, patient_id, minutes) VALUES ($1, $2, 50)", [spaeter, f.a.patientId]);
    // Gleiches Datum: der zuerst gespeicherte Link gewinnt, unabhängig von der Reihenfolge der IDs.
    const gleichFrueh = await supervision("2026-02-01");
    const gleichSpaet = await supervision("2026-02-01");
    const dritte = (
      await one(
        c,
        "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-30', 50) RETURNING id",
        [userId, f.a.patientId]
      )
    ).id as string;
    await link(gleichSpaet, dritte, "2026-02-01T12:00:00Z");
    await link(gleichFrueh, dritte, "2026-02-01T09:00:00Z");
    // Doppelstunde in zwei Gruppensupervisionen
    const gruppeFrueh = await supervision("2026-01-10", "group");
    const gruppeSpaet = await supervision("2026-01-17", "group");
    for (const sv of [gruppeSpaet, gruppeFrueh]) {
      await c.query("INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2)", [
        sv,
        f.a.groupSessionId,
      ]);
    }

    // Fremder Link (nur über direktes SQL möglich): Supervision von B mit früherem Datum auf die Sitzung von A. Der Link
    // des eigenen Accounts gewinnt trotzdem.
    const fremd = (
      await one(
        c,
        `INSERT INTO supervision_sessions (user_id, supervisor_id, date, duration_minutes, kind)
         VALUES ($1, $2, '2025-12-01', 50, 'individual') RETURNING id`,
        [f.b.userId, f.b.supervisorId]
      )
    ).id as string;
    await link(fremd, f.a.therapySessionId, "2025-12-01T10:00:00Z");

    const zahl = async (sql: string) => (await one(c, sql)).n as number;
    const supervisionenVorher = await zahl("SELECT count(*)::int AS n FROM supervision_sessions");
    const anteileVorher = (await c.query("SELECT supervision_id, patient_id, minutes FROM supervision_cases ORDER BY 1, 2")).rows;

    const hinweise: string[] = [];
    c.on("notice", (n) => { if (n.message?.startsWith("Migration 010")) hinweise.push(n.message); });
    expect(await migrateBis(c, "010_supervision_links_unique.sql")).toEqual(["010_supervision_links_unique.sql"]);
    expect(hinweise).toEqual([
      "Migration 010: 3 doppelte Zuordnungen von Therapiesitzungen und 1 von Doppelstunden entfernt",
    ]);

    const links = async (table: string, column: string, id: string) =>
      (await c.query(`SELECT supervision_id FROM ${table} WHERE ${column} = $1`, [id])).rows.map((r) => r.supervision_id);
    expect(await links("supervision_therapy_links", "therapy_session_id", f.a.therapySessionId)).toEqual([f.a.supervisionId]);
    expect(await links("supervision_therapy_links", "therapy_session_id", zweite)).toEqual([spaeter]);
    expect(await links("supervision_therapy_links", "therapy_session_id", dritte)).toEqual([gleichFrueh]);
    expect(await links("supervision_group_session_links", "group_session_id", f.a.groupSessionId)).toEqual([gruppeFrueh]);
    // Account B unberührt
    expect(await links("supervision_therapy_links", "therapy_session_id", f.b.therapySessionId)).toEqual([f.b.supervisionId]);

    expect(await links("supervision_therapy_links", "supervision_id", fremd)).toEqual([]);
    expect(await zahl("SELECT count(*)::int AS n FROM supervision_sessions")).toBe(supervisionenVorher);
    expect((await c.query("SELECT supervision_id, patient_id, minutes FROM supervision_cases ORDER BY 1, 2")).rows).toEqual(
      anteileVorher
    );

    await expect(link(gleichSpaet, f.a.therapySessionId, "2026-03-01T00:00:00Z")).rejects.toThrow(
      /supervision_therapy_links_therapy_session_id_key/
    );
    await expect(
      c.query("INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2)", [
        gruppeSpaet,
        f.a.groupSessionId,
      ])
    ).rejects.toThrow(/supervision_group_session_links_group_session_id_key/);
  });

  it("meldet ohne Doppelzuordnungen nichts", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    await migrateBis(t.client, "009_supervision_cases.sql");
    await seedOwnershipFixture(t.client);
    const hinweise: string[] = [];
    t.client.on("notice", (n) => { if (n.message?.startsWith("Migration 010")) hinweise.push(n.message); });
    expect(await migrateBis(t.client, "010_supervision_links_unique.sql")).toEqual(["010_supervision_links_unique.sql"]);
    expect(hinweise).toEqual([]);
  });
});
