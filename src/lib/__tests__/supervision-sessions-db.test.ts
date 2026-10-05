// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";
import {
  newGroupSessionId,
  newSupervisionSessionId,
  newSupervisorId,
  newTherapySessionId,
  SupervisionSession,
} from "@/types";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { updateSupervisionSession, deleteSupervisionSession } from "../db/supervision-sessions";

describe.skipIf(!TEST_DATABASE_URL)("Supervisionen ändern und löschen", () => {
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

  function ownSupervision(f: Awaited<ReturnType<typeof setup>>["f"], linkedTherapySessionIds: string[]): SupervisionSession {
    return {
      id: newSupervisionSessionId(f.a.supervisionId),
      supervisorId: newSupervisorId(f.a.supervisorId),
      date: "2026-01-20",
      durationMinutes: 90,
      kind: "individual",
      setting: "gruppe",
      linkedTherapySessionIds: linkedTherapySessionIds.map(newTherapySessionId),
      linkedGroupSessionIds: [],
    };
  }

  async function linkedIds(db: Awaited<ReturnType<typeof setup>>["db"], supervisionId: string): Promise<string[]> {
    const { rows } = await db.query(
      "SELECT therapy_session_id FROM supervision_therapy_links WHERE supervision_id = $1 ORDER BY therapy_session_id",
      [supervisionId]
    );
    return rows.map((r) => r.therapy_session_id);
  }

  it("ersetzt Stammdaten und Verknüpfungen: alte weg, neue da", async () => {
    const { db, f } = await setup();
    const second = (
      await db.query(
        "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-10', 50) RETURNING id",
        [f.a.userId, f.a.patientId]
      )
    ).rows[0];

    await updateSupervisionSession(db, f.a.userId, ownSupervision(f, [second.id]));

    const { rows } = await db.query(
      "SELECT to_char(date, 'YYYY-MM-DD') AS date, duration_minutes, setting FROM supervision_sessions WHERE id = $1",
      [f.a.supervisionId]
    );
    expect(rows[0]).toEqual({ date: "2026-01-20", duration_minutes: 90, setting: "gruppe" });
    expect(await linkedIds(db, f.a.supervisionId)).toEqual([second.id]);
  });

  it("ersetzt bei einer Gruppensupervision die Doppelstunden-Verknüpfungen: alte weg, neue da", async () => {
    const { db, f } = await setup();
    const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0];
    const groupSupervision = await one(
      `INSERT INTO supervision_sessions (user_id, supervisor_id, date, duration_minutes, kind)
       VALUES ($1, $2, '2026-01-05', 60, 'group') RETURNING id`,
      [f.a.userId, f.a.supervisorId]
    );
    await db.query("INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2)", [
      groupSupervision.id,
      f.a.groupSessionId,
    ]);
    const secondGroupSession = await one(
      "INSERT INTO group_sessions (user_id, group_id, date, status, child_count) VALUES ($1, $2, '2026-01-17', 'durchgefuehrt', 5) RETURNING id",
      [f.a.userId, f.a.groupId]
    );

    await updateSupervisionSession(db, f.a.userId, {
      id: newSupervisionSessionId(groupSupervision.id),
      supervisorId: newSupervisorId(f.a.supervisorId),
      date: "2026-01-20",
      durationMinutes: 90,
      kind: "group",
      setting: "einzel",
      linkedTherapySessionIds: [],
      linkedGroupSessionIds: [newGroupSessionId(secondGroupSession.id)],
    });

    const { rows } = await db.query(
      "SELECT group_session_id FROM supervision_group_session_links WHERE supervision_id = $1",
      [groupSupervision.id]
    );
    expect(rows.map((r) => r.group_session_id)).toEqual([secondGroupSession.id]);
    expect(await countRows(db, "group_sessions", "WHERE id = $1", [f.a.groupSessionId])).toBe(1);
  });

  it("weist fremde Verknüpfungen beim Ändern zurück und lässt alles stehen", async () => {
    const { db, f } = await setup();

    await expect(
      updateSupervisionSession(db, f.a.userId, ownSupervision(f, [f.b.therapySessionId]))
    ).rejects.toThrow("Therapiesitzung nicht gefunden");

    const { rows } = await db.query("SELECT duration_minutes FROM supervision_sessions WHERE id = $1", [
      f.a.supervisionId,
    ]);
    expect(rows[0].duration_minutes).toBe(60);
    expect(await linkedIds(db, f.a.supervisionId)).toEqual([f.a.therapySessionId]);
  });

  it("weist fremde Supervisionssitzungen beim Ändern zurück", async () => {
    const { db, f } = await setup();
    const foreign: SupervisionSession = { ...ownSupervision(f, []), id: newSupervisionSessionId(f.b.supervisionId) };

    await expect(updateSupervisionSession(db, f.a.userId, foreign)).rejects.toThrow(
      "Supervisionssitzung nicht gefunden"
    );

    expect(await linkedIds(db, f.b.supervisionId)).toEqual([f.b.therapySessionId]);
    const { rows } = await db.query("SELECT supervisor_id FROM supervision_sessions WHERE id = $1", [f.b.supervisionId]);
    expect(rows[0].supervisor_id).toBe(f.b.supervisorId);
  });

  it("löscht die eigene Supervision samt Verknüpfungen, die Therapiesitzung bleibt", async () => {
    const { db, f } = await setup();

    await deleteSupervisionSession(db, f.a.userId, f.a.supervisionId);

    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [f.a.supervisionId])).toBe(0);
    expect(await countRows(db, "supervision_therapy_links", "WHERE supervision_id = $1", [f.a.supervisionId])).toBe(0);
    expect(await countRows(db, "therapy_sessions", "WHERE id = $1", [f.a.therapySessionId])).toBe(1);
  });

  it("weist fremde Supervisionen beim Löschen zurück", async () => {
    const { db, f } = await setup();

    await expect(deleteSupervisionSession(db, f.a.userId, f.b.supervisionId)).rejects.toThrow(
      "Supervisionssitzung nicht gefunden"
    );

    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [f.b.supervisionId])).toBe(1);
    expect(await linkedIds(db, f.b.supervisionId)).toEqual([f.b.therapySessionId]);
  });

  it("weist eine fremde Supervisor:in beim Ändern zurück und lässt alles stehen", async () => {
    const { db, f } = await setup();
    await expect(
      updateSupervisionSession(db, f.a.userId, { ...ownSupervision(f, []), supervisorId: newSupervisorId(f.b.supervisorId) })
    ).rejects.toThrow("Supervisor:in nicht gefunden");
    const { rows } = await db.query("SELECT supervisor_id, duration_minutes FROM supervision_sessions WHERE id = $1", [f.a.supervisionId]);
    expect(rows[0]).toEqual({ supervisor_id: f.a.supervisorId, duration_minutes: 60 });
    expect(await linkedIds(db, f.a.supervisionId)).toEqual([f.a.therapySessionId]);
  });

  it("setzt updated_at beim Ändern neu", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE supervision_sessions SET updated_at = '2020-01-01T00:00:00Z' WHERE id = $1", [f.a.supervisionId]);
    await updateSupervisionSession(db, f.a.userId, ownSupervision(f, [f.a.therapySessionId]));
    const { rows } = await db.query(
      "SELECT updated_at > '2020-01-02T00:00:00Z'::timestamptz AS bumped FROM supervision_sessions WHERE id = $1",
      [f.a.supervisionId]
    );
    expect(rows[0].bumped).toBe(true);
  });
});
