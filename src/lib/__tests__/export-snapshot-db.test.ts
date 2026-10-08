// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import pg from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, type OwnershipFixture } from "./helpers/fixtures";
import { loadUserData, type UserData } from "../db/user-data";
import { closePool, withSnapshot, type Db } from "../db";

// #41: Zwischen zwei Leseabfragen des Exports committet eine zweite Verbindung eine neue Therapiesitzung samt
// Supervisionszuordnung. Der Einschub hängt an der Abfrage auf therapy_sessions – deterministisch, ohne Timing.
describe.skipIf(!TEST_DATABASE_URL)("Datenexport aus einem Snapshot", () => {
  const cleanups: (() => Promise<void>)[] = [];
  const databaseUrl = process.env.DATABASE_URL;
  afterEach(async () => {
    await closePool();
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  async function setup() {
    const t = await createTestDb();
    cleanups.push(t.cleanup);
    const f = await seedOwnershipFixture(t.client);
    const schema = (await t.client.query("SELECT current_schema() AS schema")).rows[0].schema as string;
    const url = new URL(TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    // Der Pool aus db.ts (wie in den Routen) und die zweite Verbindung arbeiten im Test-Schema.
    process.env.DATABASE_URL = url.toString();
    const other = new pg.Client({ connectionString: url.toString() });
    await other.connect();
    cleanups.push(() => other.end());
    return { db: t.client, f, other };
  }

  // Neue Sitzung, der bestehenden Supervision zugeordnet; ohne Transaktion sofort committet.
  async function neueVerknuepfteSitzung(other: pg.Client, f: OwnershipFixture): Promise<string> {
    const { rows } = await other.query(
      `INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes, category)
       VALUES ($1, $2, '2026-01-05', 50, 'probatorik') RETURNING id`,
      [f.a.userId, f.a.patientId]
    );
    await other.query("INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id) VALUES ($1, $2)", [
      f.a.supervisionId,
      rows[0].id,
    ]);
    return rows[0].id;
  }

  // Führt nach der ersten Abfrage auf therapy_sessions einmal `einschub` aus.
  function mitEinschub(db: Db, einschub: () => Promise<unknown>): Db {
    let erledigt = false;
    return {
      query: async (text, params) => {
        const result = await db.query(text, params);
        if (!erledigt && /FROM therapy_sessions WHERE/.test(text)) {
          erledigt = true;
          await einschub();
        }
        return result;
      },
    };
  }

  function verwaisteVerknuepfungen(data: UserData): string[] {
    const ids = new Set<string>(data.therapySessions.map((s) => s.id));
    return data.supervisionSessions.flatMap((s) => s.linkedTherapySessionIds).filter((id) => !ids.has(id));
  }

  it("ohne Snapshot: die Supervision verweist auf eine Sitzung, die im Export fehlt (Gegenprobe)", async () => {
    const { db, f, other } = await setup();
    let neu = "";
    const data = await loadUserData(mitEinschub(db, async () => (neu = await neueVerknuepfteSitzung(other, f))), f.a.userId);
    expect(verwaisteVerknuepfungen(data)).toEqual([neu]);
  });

  it("mit withSnapshot: der Export zeigt vollständig den Stand vor der Änderung", async () => {
    const { db, f, other } = await setup();
    let neu = "";
    const data = await withSnapshot((tx) =>
      loadUserData(mitEinschub(tx, async () => (neu = await neueVerknuepfteSitzung(other, f))), f.a.userId)
    );
    expect(neu).not.toBe("");
    expect(data.therapySessions.map((s) => s.id)).toEqual([f.a.therapySessionId]);
    expect(data.supervisionSessions[0].linkedTherapySessionIds).toEqual([f.a.therapySessionId]);
    expect(verwaisteVerknuepfungen(data)).toEqual([]);

    // Danach ist die Änderung sichtbar – der Snapshot hat sie nur ausgeblendet.
    const danach = await loadUserData(db, f.a.userId);
    expect(danach.therapySessions.map((s) => s.id)).toEqual([f.a.therapySessionId, neu]);
    expect(verwaisteVerknuepfungen(danach)).toEqual([]);
  });

  it("withSnapshot ist schreibgeschützt", async () => {
    const { f } = await setup();
    await expect(
      withSnapshot((tx) => tx.query("UPDATE financial_settings SET income_per_hour = 1 WHERE user_id = $1", [f.a.userId]))
    ).rejects.toMatchObject({ code: "25006" }); // read_only_sql_transaction
  });
});
