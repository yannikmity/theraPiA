// @vitest-environment node
// Zeitzone östlich von UTC erzwingen: dort lieferte pg DATE als lokale Mitternacht,
// und toISOString() verschob das Datum auf den Vortag.
process.env.TZ = "Europe/Berlin";

import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";
import { newTherapySessionId } from "@/types";
import { mapTherapySessionRow, type TherapySessionRow } from "../db-mappers";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { updateTherapySession } from "../db/therapy-sessions";

const READ_SQL = `SELECT ts.id, ts.patient_id, ts.date, ts.duration_minutes, ts.notes, ts.category
                  FROM therapy_sessions ts WHERE ts.id = $1`;

describe.skipIf(!TEST_DATABASE_URL)("DATE-Spalten ohne Tagesversatz (TZ=Europe/Berlin)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    await t.client.query("UPDATE therapy_sessions SET date = '2026-09-15' WHERE id = $1", [
      f.a.therapySessionId,
    ]);
    return { db: t.client, f };
  }

  it("läuft wirklich in einer Zeitzone östlich von UTC", () => {
    expect(new Date(2026, 8, 15).getTimezoneOffset()).toBeLessThan(0);
  });

  it("liefert DATE als unveränderten YYYY-MM-DD-String", async () => {
    const { db } = await setup();
    const { rows } = await db.query("SELECT '2026-09-15'::date AS d");
    expect(rows[0].d).toBe("2026-09-15");
  });

  it("liest eine Sitzung vom 2026-09-15 als 2026-09-15 zurück", async () => {
    const { db, f } = await setup();
    const { rows } = await db.query(READ_SQL, [f.a.therapySessionId]);
    expect(mapTherapySessionRow(rows[0] as TherapySessionRow).date).toBe("2026-09-15");
  });

  it("unverändertes Speichern lässt das Datum auf 2026-09-15", async () => {
    const { db, f } = await setup();
    const { rows } = await db.query(READ_SQL, [f.a.therapySessionId]);
    const session = mapTherapySessionRow(rows[0] as TherapySessionRow);

    await updateTherapySession(db, f.a.userId, {
      ...session,
      id: newTherapySessionId(session.id),
    });

    const after = await db.query(
      "SELECT to_char(date, 'YYYY-MM-DD') AS date FROM therapy_sessions WHERE id = $1",
      [f.a.therapySessionId]
    );
    expect(after.rows[0].date).toBe("2026-09-15");
  });
});
