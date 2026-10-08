// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";

import type { Client } from "pg";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";

const state = vi.hoisted(() => ({ client: undefined as Client | undefined, userId: "" }));
vi.mock("../db", () => ({
  query: (text: string, params?: unknown[]) => state.client!.query(text, params),
  // Wie withTransaction in db.ts, nur auf der Testverbindung.
  withTransaction: async <T,>(fn: (tx: Client) => Promise<T>): Promise<T> => {
    const client = state.client!;
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  },
}));
vi.mock("../db/get-current-user", () => ({ getCurrentUserId: async () => state.userId }));
import {
  addSupervisionSession,
  getSupervisionSessions,
  insertSupervisionSession,
  updateSupervisionSession,
} from "../db/supervision-sessions";
import { newPatientId, newSupervisionSessionId, newSupervisorId, newTherapySessionId } from "@/types";

describe.skipIf(!TEST_DATABASE_URL)("insertSupervisionSession", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    state.client = undefined;
  });

  it("weist Verknüpfungen auf Sitzungen anderer Accounts zurück", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const q = (sql: string, p: unknown[] = []) => t.client.query(sql, p).then((r) => r.rows[0]);
    const a = await q("INSERT INTO users (email, name) VALUES ('a@example.com', 'A') RETURNING id");
    const b = await q("INSERT INTO users (email, name) VALUES ('b@example.com', 'B') RETURNING id");
    const svA = await q("INSERT INTO supervisors (user_id, name) VALUES ($1, 'SV') RETURNING id", [a.id]);
    const patB = await q(
      "INSERT INTO patients (user_id, chiffre, therapy_type, start_date) VALUES ($1, 'B-1', 'kurzzeittherapie', '2026-01-01') RETURNING id",
      [b.id]
    );
    const sessB = await q(
      "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-02', 50) RETURNING id",
      [b.id, patB.id]
    );

    await expect(
      insertSupervisionSession(t.client, a.id, {
        id: crypto.randomUUID(),
        supervisorId: svA.id,
        date: "2026-01-03",
        durationMinutes: 50,
        kind: "individual",
        setting: "einzel",
        linkedTherapySessionIds: [sessB.id],
        linkedGroupSessionIds: [],
        caseShares: [],
      } as never)
    ).rejects.toThrow("Therapiesitzung nicht gefunden");

    const count = await q("SELECT count(*)::int AS n FROM supervision_therapy_links");
    expect(count.n).toBe(0);
  });

  it("weist Verknüpfungen auf Gruppensitzungen anderer Accounts zurück", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const q = (sql: string, p: unknown[] = []) => t.client.query(sql, p).then((r) => r.rows[0]);
    const a = await q("INSERT INTO users (email, name) VALUES ('a@example.com', 'A') RETURNING id");
    const b = await q("INSERT INTO users (email, name) VALUES ('b@example.com', 'B') RETURNING id");
    const svA = await q("INSERT INTO supervisors (user_id, name) VALUES ($1, 'SV') RETURNING id", [a.id]);
    const groupB = await q(
      "INSERT INTO groups (user_id, name, start_date, planned_session_count) VALUES ($1, 'Gruppe B', '2026-01-01', 10) RETURNING id",
      [b.id]
    );
    const gsB = await q(
      "INSERT INTO group_sessions (user_id, group_id, date, status) VALUES ($1, $2, '2026-01-02', 'durchgefuehrt') RETURNING id",
      [b.id, groupB.id]
    );

    await expect(
      insertSupervisionSession(t.client, a.id, {
        id: crypto.randomUUID(),
        supervisorId: svA.id,
        date: "2026-01-03",
        durationMinutes: 50,
        kind: "group",
        setting: "einzel",
        linkedTherapySessionIds: [],
        linkedGroupSessionIds: [gsB.id],
        caseShares: [],
      } as never)
    ).rejects.toThrow("Gruppensitzung nicht gefunden");

    const links = await q("SELECT count(*)::int AS n FROM supervision_group_session_links");
    expect(links.n).toBe(0);
    const sessions = await q("SELECT count(*)::int AS n FROM supervision_sessions");
    expect(sessions.n).toBe(0);
  });

  it("speichert das Setting der Supervision", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    const id = crypto.randomUUID();
    await insertSupervisionSession(t.client, f.a.userId, {
      id: newSupervisionSessionId(id),
      supervisorId: newSupervisorId(f.a.supervisorId),
      date: "2026-01-20",
      durationMinutes: 60,
      kind: "individual",
      setting: "gruppe",
      linkedTherapySessionIds: [],
      linkedGroupSessionIds: [],
      caseShares: [],
    });
    const { rows } = await t.client.query("SELECT setting FROM supervision_sessions WHERE id = $1", [id]);
    expect(rows[0].setting).toBe("gruppe");
  });

  it("fasst doppelte Verknüpfungs-IDs zusammen, statt am Primärschlüssel zu scheitern (23505)", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    const id = crypto.randomUUID();
    await insertSupervisionSession(t.client, f.a.userId, {
      id: newSupervisionSessionId(id),
      supervisorId: newSupervisorId(f.a.supervisorId),
      date: "2026-01-20",
      durationMinutes: 60,
      kind: "individual",
      setting: "einzel",
      linkedTherapySessionIds: [f.a.therapySessionId, f.a.therapySessionId].map(newTherapySessionId),
      linkedGroupSessionIds: [],
      caseShares: [{ patientId: newPatientId(f.a.patientId), minutes: 60 }],
    });
    expect(await countRows(t.client, "supervision_therapy_links", "WHERE supervision_id = $1", [id])).toBe(1);

    await updateSupervisionSession(t.client, f.a.userId, {
      id: newSupervisionSessionId(id),
      supervisorId: newSupervisorId(f.a.supervisorId),
      date: "2026-01-21",
      durationMinutes: 60,
      kind: "individual",
      setting: "einzel",
      linkedTherapySessionIds: [f.a.therapySessionId, f.a.therapySessionId].map(newTherapySessionId),
      linkedGroupSessionIds: [],
      caseShares: [{ patientId: newPatientId(f.a.patientId), minutes: 60 }],
    });
    expect(await countRows(t.client, "supervision_therapy_links", "WHERE supervision_id = $1", [id])).toBe(1);
  });

  it("weist eine fremde Supervisor:in beim Anlegen zurück, bevor etwas geschrieben wird", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    await expect(
      insertSupervisionSession(t.client, f.a.userId, {
        id: newSupervisionSessionId(crypto.randomUUID()),
        supervisorId: newSupervisorId(f.b.supervisorId),
        date: "2026-01-20",
        durationMinutes: 60,
        kind: "individual",
        setting: "einzel",
        linkedTherapySessionIds: [newTherapySessionId(f.a.therapySessionId)],
        linkedGroupSessionIds: [],
        caseShares: [{ patientId: newPatientId(f.a.patientId), minutes: 60 }],
      })
    ).rejects.toThrow("Supervisor:in nicht gefunden");
    expect(await countRows(t.client, "supervision_sessions")).toBe(2); // nur die beiden aus der Fixture
  });

  it("addSupervisionSession rollt die Supervision zurück, wenn das Einfügen der Verknüpfungen scheitert", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    state.client = t.client;
    state.userId = f.a.userId;
    // Fehler NACH dem ersten Insert: die Supervision steht schon, erst die Verknüpfung scheitert.
    await t.client.query(`
      CREATE FUNCTION test_link_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulierter Fehler'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_link_fail BEFORE INSERT ON supervision_therapy_links FOR EACH ROW EXECUTE FUNCTION test_link_fail();
    `);
    const id = crypto.randomUUID();
    await expect(
      addSupervisionSession({
        id: newSupervisionSessionId(id),
        supervisorId: newSupervisorId(f.a.supervisorId),
        date: "2026-01-20",
        durationMinutes: 60,
        kind: "individual",
        setting: "einzel",
        linkedTherapySessionIds: [newTherapySessionId(f.a.therapySessionId)],
        linkedGroupSessionIds: [],
        caseShares: [{ patientId: newPatientId(f.a.patientId), minutes: 60 }],
      })
    ).rejects.toThrow("simulierter Fehler");
    expect(await countRows(t.client, "supervision_sessions", "WHERE id = $1", [id])).toBe(0);
  });

  it("getSupervisionSessions liefert die Anteile je Fall, nur eigene", async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    state.client = t.client;
    state.userId = f.a.userId;
    const ohne = crypto.randomUUID();
    await insertSupervisionSession(t.client, f.a.userId, {
      id: newSupervisionSessionId(ohne),
      supervisorId: newSupervisorId(f.a.supervisorId),
      date: "2026-01-20",
      durationMinutes: 45,
      kind: "individual",
      setting: "einzel",
      linkedTherapySessionIds: [],
      linkedGroupSessionIds: [],
      caseShares: [],
    });
    const sessions = await getSupervisionSessions();
    expect(sessions.map((s) => [s.id, s.caseShares]).sort()).toEqual(
      [
        [f.a.supervisionId, [{ patientId: f.a.patientId, minutes: 60 }]],
        [ohne, []],
      ].sort()
    );
  });
});
