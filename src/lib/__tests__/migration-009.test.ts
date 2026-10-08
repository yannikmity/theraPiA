// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { Client } from "pg";
import { createTestDb, migrateBis, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";

describe.skipIf(!TEST_DATABASE_URL)("Migration 009 (Anteil je Fall einer Supervision)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  const one = async (client: Client, sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows[0];

  it("legt die Tabelle mit Schlüssel (Supervision, Patient:in) an und lehnt Anteile von 0 Minuten ab", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    await expect(
      t.client.query("INSERT INTO supervision_cases (supervision_id, patient_id, minutes) VALUES ($1, $2, 30)", [
        f.a.supervisionId,
        f.a.patientId,
      ])
    ).rejects.toThrow(/supervision_cases_pkey/);
    await t.client.query("DELETE FROM supervision_cases WHERE supervision_id = $1", [f.a.supervisionId]);
    await expect(
      t.client.query("INSERT INTO supervision_cases (supervision_id, patient_id, minutes) VALUES ($1, $2, 0)", [
        f.a.supervisionId,
        f.a.patientId,
      ])
    ).rejects.toThrow(/supervision_cases_minutes_check/);
  });

  it("befüllt die Anteile aus Bestandsdaten (Stand 008): gleich verteilt, Summe = Gesamtdauer, Gruppen ohne Anteil", async () => {
    const t = await createTestDb({ migrate: false });
    cleanup = t.cleanup;
    const c = t.client;
    await migrateBis(c, "008_supervision_setting.sql");
    const f = await seedOwnershipFixture(c);
    const userId = f.a.userId;
    const patient = async (chiffre: string) =>
      (
        await one(
          c,
          "INSERT INTO patients (user_id, chiffre, therapy_type, start_date) VALUES ($1, $2, 'kurzzeittherapie', '2026-01-01') RETURNING id",
          [userId, chiffre]
        )
      ).id as string;
    const sitzung = async (patientId: string) =>
      (
        await one(
          c,
          "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-05', 50) RETURNING id",
          [userId, patientId]
        )
      ).id as string;
    const supervision = async (minutes: number, sessions: string[], kind = "individual") => {
      const sv = await one(
        c,
        `INSERT INTO supervision_sessions (user_id, supervisor_id, date, duration_minutes, kind)
         VALUES ($1, $2, '2026-01-20', $3, $4) RETURNING id`,
        [userId, f.a.supervisorId, minutes, kind]
      );
      for (const s of sessions) {
        await c.query("INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id) VALUES ($1, $2)", [sv.id, s]);
      }
      return sv.id as string;
    };

    const p1 = await patient("C-1");
    const p2 = await patient("C-2");
    const p3 = await patient("C-3");
    const s1a = await sitzung(p1);
    const s1b = await sitzung(p1);
    const s2 = await sitzung(p2);
    const s3 = await sitzung(p3);
    // Zwei Sitzungen von C-1 und eine von C-2: zwei Fälle, nicht drei Sitzungen
    const zweiFaelle = await supervision(50, [s1a, s1b, s2]);
    // 50 Min auf drei Fälle: Rest minutenweise an die ersten nach Chiffre
    const dreiFaelle = await supervision(50, [s3, s2, s1a]);
    // 2 Min auf drei Fälle: der dritte Anteil wäre 0 und entfällt
    const winzig = await supervision(2, [s1b, s2, s3]);
    const ohneSitzung = await supervision(60, []);
    // Falsche Art (nur über direktes SQL möglich): Gruppensupervisionen bekommen keine Anteile
    const gruppe = await supervision(60, [s1a], "group");
    // Verknüpfung auf eine Sitzung eines anderen Accounts (nur über direktes SQL möglich) zählt nicht
    const fremd = await supervision(40, [s1a, f.b.therapySessionId]);

    const spalten = "id, supervisor_id, to_char(date, 'YYYY-MM-DD') AS date, duration_minutes, kind, setting";
    const vorher = await c.query(`SELECT ${spalten} FROM supervision_sessions ORDER BY id`);
    expect(await migrateBis(c, "009_supervision_cases.sql")).toEqual(["009_supervision_cases.sql"]);
    expect((await c.query(`SELECT ${spalten} FROM supervision_sessions ORDER BY id`)).rows).toEqual(vorher.rows);

    const anteile = async (supervisionId: string) =>
      (
        await c.query(
          `SELECT p.chiffre, sc.minutes FROM supervision_cases sc JOIN patients p ON p.id = sc.patient_id
           WHERE sc.supervision_id = $1 ORDER BY p.chiffre`,
          [supervisionId]
        )
      ).rows;
    expect(await anteile(zweiFaelle)).toEqual([
      { chiffre: "C-1", minutes: 25 },
      { chiffre: "C-2", minutes: 25 },
    ]);
    expect(await anteile(dreiFaelle)).toEqual([
      { chiffre: "C-1", minutes: 17 },
      { chiffre: "C-2", minutes: 17 },
      { chiffre: "C-3", minutes: 16 },
    ]);
    expect(await anteile(winzig)).toEqual([
      { chiffre: "C-1", minutes: 1 },
      { chiffre: "C-2", minutes: 1 },
    ]);
    expect(await anteile(ohneSitzung)).toEqual([]);
    expect(await anteile(gruppe)).toEqual([]);
    expect(await anteile(fremd)).toEqual([{ chiffre: "C-1", minutes: 40 }]);
    // Fixture-Supervisionen: je ein Fall mit der ganzen Dauer
    expect(await anteile(f.a.supervisionId)).toEqual([{ chiffre: "A-1", minutes: 60 }]);
    expect(await anteile(f.b.supervisionId)).toEqual([{ chiffre: "B-1", minutes: 60 }]);

    // Für jede Supervision mit Anteilen: Summe = Gesamtdauer
    const { rows } = await c.query(
      `SELECT ss.id FROM supervision_sessions ss JOIN supervision_cases sc ON sc.supervision_id = ss.id
       GROUP BY ss.id, ss.duration_minutes HAVING sum(sc.minutes) <> ss.duration_minutes`
    );
    expect(rows).toEqual([]);
  });
});
