// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import pg from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";
import {
  newGroupSessionId,
  newPatientId,
  newSupervisionSessionId,
  newSupervisorId,
  newTherapySessionId,
  type SupervisionSession,
} from "@/types";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { insertSupervisionSession, MELDUNG_SCHON_ZUGEORDNET, updateSupervisionSession } from "../db/supervision-sessions";

// Eine Sitzung gehört zu höchstens einer Supervision (#35); neue Verknüpfungen nicht nach dem Supervisionsdatum (#37).
describe.skipIf(!TEST_DATABASE_URL)("Supervision: Sitzung nur einmal zuordnen", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    return { db: t.client, f };
  }

  // Die Fixture-Supervision von A (04.01.) bespricht schon die Sitzung von A-1 am 02.01. mit 60 Min.
  function zweite(f: Awaited<ReturnType<typeof setup>>["f"], overrides: Partial<SupervisionSession> = {}): SupervisionSession {
    return {
      id: newSupervisionSessionId(crypto.randomUUID()),
      supervisorId: newSupervisorId(f.a.supervisorId),
      date: "2026-01-20",
      durationMinutes: 50,
      kind: "individual",
      setting: "einzel",
      linkedTherapySessionIds: [newTherapySessionId(f.a.therapySessionId)],
      linkedGroupSessionIds: [],
      caseShares: [{ patientId: newPatientId(f.a.patientId), minutes: 50 }],
      ...overrides,
    };
  }

  it("lehnt eine zweite Supervision auf dieselbe Sitzung ab und schreibt nichts, auch keinen Anteil", async () => {
    const { db, f } = await setup();
    await expect(insertSupervisionSession(db, f.a.userId, zweite(f))).rejects.toThrow(
      "Die Sitzung A-1 am 02.01.2026 ist inzwischen schon einer anderen Supervision zugeordnet. Bitte die Seite neu laden."
    );
    expect(await countRows(db, "supervision_sessions", "WHERE user_id = $1", [f.a.userId])).toBe(1);
    expect(await countRows(db, "supervision_therapy_links", "WHERE therapy_session_id = $1", [f.a.therapySessionId])).toBe(1);
    expect(await countRows(db, "supervision_cases", "WHERE patient_id = $1", [f.a.patientId])).toBe(1);
  });

  it("lehnt beim Bearbeiten eine Sitzung ab, die eine andere Supervision schon hat; die eigene bleibt erlaubt", async () => {
    const { db, f } = await setup();
    const sv = zweite(f, { linkedTherapySessionIds: [], caseShares: [] });
    await insertSupervisionSession(db, f.a.userId, sv);
    await expect(updateSupervisionSession(db, f.a.userId, zweite(f, { id: sv.id }))).rejects.toThrow(
      "inzwischen schon einer anderen Supervision zugeordnet"
    );
    expect(await countRows(db, "supervision_therapy_links", "WHERE supervision_id = $1", [sv.id])).toBe(0);
    // Die Fixture-Supervision behält ihre eigene Sitzung beim Bearbeiten.
    await updateSupervisionSession(db, f.a.userId, zweite(f, { id: newSupervisionSessionId(f.a.supervisionId), date: "2026-01-04" }));
    expect(await countRows(db, "supervision_therapy_links", "WHERE supervision_id = $1", [f.a.supervisionId])).toBe(1);
  });

  it("lehnt eine Doppelstunde ab, die schon einer anderen Gruppensupervision zugeordnet ist", async () => {
    const { db, f } = await setup();
    const gruppe = (id = crypto.randomUUID()) =>
      zweite(f, {
        id: newSupervisionSessionId(id),
        kind: "group",
        linkedTherapySessionIds: [],
        linkedGroupSessionIds: [newGroupSessionId(f.a.groupSessionId)],
        caseShares: [],
      });
    await insertSupervisionSession(db, f.a.userId, gruppe());
    await expect(insertSupervisionSession(db, f.a.userId, gruppe())).rejects.toThrow(
      "Die Sitzung Gruppe A am 03.01.2026 ist inzwischen schon einer anderen Supervision zugeordnet."
    );
    expect(await countRows(db, "supervision_group_session_links", "WHERE group_session_id = $1", [f.a.groupSessionId])).toBe(1);
  });

  it("zwei gleichzeitige Anfragen: der Unique-Index lehnt die zweite mit fachlicher Meldung ab", async () => {
    const { db, f } = await setup();
    await db.query("DELETE FROM supervision_sessions WHERE id = $1", [f.a.supervisionId]);
    const zweiteVerbindung = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await zweiteVerbindung.connect();
    try {
      const { rows } = await db.query("SELECT current_schema() AS s");
      await zweiteVerbindung.query(`SET search_path TO ${rows[0].s}`);
      const pid = (await zweiteVerbindung.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      // Beide prüfen vor dem Schreiben, bevor die erste festgeschrieben ist – die Vorprüfung sieht also nichts.
      await db.query("BEGIN");
      await zweiteVerbindung.query("BEGIN");
      await insertSupervisionSession(db, f.a.userId, zweite(f));
      const zweiterVersuch = insertSupervisionSession(zweiteVerbindung, f.a.userId, zweite(f));
      // Erst festschreiben, wenn der zweite Insert auf die Sperre der ersten Transaktion wartet.
      for (let i = 0; i < 100; i++) {
        const { rows: warten } = await db.query(
          "SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'",
          [pid]
        );
        if (warten.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await db.query("COMMIT");
      await expect(zweiterVersuch).rejects.toThrow(MELDUNG_SCHON_ZUGEORDNET);
      await zweiteVerbindung.query("ROLLBACK");
    } finally {
      await zweiteVerbindung.end();
    }
    expect(await countRows(db, "supervision_therapy_links", "WHERE therapy_session_id = $1", [f.a.therapySessionId])).toBe(1);
  });

  it("lehnt neu verknüpfte Sitzungen nach dem Supervisionsdatum ab; gespeicherte bleiben beim Bearbeiten erlaubt", async () => {
    const { db, f } = await setup();
    const spaeter = (
      await db.query(
        "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-25', 50) RETURNING id",
        [f.a.userId, f.a.patientId]
      )
    ).rows[0].id as string;
    await expect(
      insertSupervisionSession(db, f.a.userId, zweite(f, { linkedTherapySessionIds: [newTherapySessionId(spaeter)] }))
    ).rejects.toThrow("Die Sitzung A-1 am 25.01.2026 liegt nach dem Datum der Supervision");

    // Bestand: Link auf eine Sitzung nach dem Datum (z. B. Sitzung später verschoben) – Bearbeiten bleibt möglich.
    await db.query("INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id) VALUES ($1, $2)", [
      f.a.supervisionId,
      spaeter,
    ]);
    await updateSupervisionSession(
      db,
      f.a.userId,
      zweite(f, {
        id: newSupervisionSessionId(f.a.supervisionId),
        date: "2026-01-04",
        durationMinutes: 60,
        linkedTherapySessionIds: [newTherapySessionId(f.a.therapySessionId), newTherapySessionId(spaeter)],
        caseShares: [{ patientId: newPatientId(f.a.patientId), minutes: 60 }],
      })
    );
    expect(await countRows(db, "supervision_therapy_links", "WHERE supervision_id = $1", [f.a.supervisionId])).toBe(2);
  });
});
